import "dotenv/config";
import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { findJapaneseCards, resolveCardQuery, CardSiteError } from "./card-site.js";
import { buildCardMessage, buildSearchResultComponents } from "./card-response.js";

if (!process.env.DISCORD_TOKEN) {
  throw new Error("DISCORD_TOKEN must be set. Copy .env.example to .env.");
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, readyClient => {
  console.log(`Ready as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "card") {
      const query = interaction.options.getString("query", true);
      await interaction.deferReply();
      const resolved = await resolveCardQuery(query);
      let cards = resolved.cards;
      const searchResults = resolved.searchResults;
      if (cards.length === 0) {
        await interaction.editReply(`日本語版のカード「${query}」は見つかりませんでした。カード番号または英語名を確認してください。`);
        return;
      }

      let selectedVariant = 0;
      const currentMessage = () => {
        const cardMessage = buildCardMessage(cards, selectedVariant);
        return {
          ...cardMessage,
          components: [
            ...buildSearchResultComponents(searchResults, cards[0].number),
            ...cardMessage.components
          ]
        };
      };

      const message = await interaction.editReply(currentMessage());
      if (cards.length < 2 && searchResults.length < 2) return;

      const collector = message.createMessageComponentCollector({ time: 10 * 60 * 1000 });
      collector.on("collect", async componentInteraction => {
        if (!componentInteraction.isStringSelectMenu() || !["card-variant", "card-result"].includes(componentInteraction.customId)) return;
        if (componentInteraction.user.id !== interaction.user.id) {
          await componentInteraction.reply({
            content: "このメニューはコマンドを実行したユーザーだけが操作できます。",
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        if (componentInteraction.customId === "card-variant") {
          selectedVariant = Number.parseInt(componentInteraction.values[0], 10);
          await componentInteraction.update(currentMessage());
          return;
        }

        await componentInteraction.deferUpdate();
        try {
          const selectedCards = await findJapaneseCards(componentInteraction.values[0]);
          if (selectedCards.length === 0) {
            await interaction.followUp({
              content: "その英語版カード番号に対応する日本語版カードが見つかりませんでした。",
              flags: MessageFlags.Ephemeral
            });
            return;
          }
          cards = selectedCards;
          selectedVariant = 0;
          await interaction.editReply(currentMessage());
        } catch (error) {
          console.error(error);
          await interaction.followUp({
            content: "カードの切り替え中にエラーが発生しました。もう一度 `/card` を実行してください。",
            flags: MessageFlags.Ephemeral
          }).catch(() => {});
        }
      });
      collector.on("end", () => interaction.editReply({ components: [] }).catch(() => {}));
    }
  } catch (error) {
    console.error(error);
    const message = error instanceof CardSiteError
      ? `カードリストを検索できませんでした: ${error.message}`
      : "カードの検索中にエラーが発生しました。しばらくしてからもう一度お試しください。";
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: message, embeds: [], components: [] }).catch(() => {});
    else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
});

await client.login(process.env.DISCORD_TOKEN);
