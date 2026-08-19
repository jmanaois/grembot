import "dotenv/config";
import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { findJapaneseCards, CardSiteError } from "./card-site.js";
import { buildCardMessage } from "./card-response.js";

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
      const cardId = interaction.options.getString("id", true);
      await interaction.deferReply();
      const cards = await findJapaneseCards(cardId);
      if (cards.length === 0) {
        await interaction.editReply(`日本語版のカード「${cardId}」は見つかりませんでした。カード番号を確認してください。`);
        return;
      }

      const message = await interaction.editReply(buildCardMessage(cards));
      if (cards.length < 2) return;

      const collector = message.createMessageComponentCollector({ time: 10 * 60 * 1000 });
      collector.on("collect", async componentInteraction => {
        if (!componentInteraction.isStringSelectMenu() || componentInteraction.customId !== "card-variant") return;
        if (componentInteraction.user.id !== interaction.user.id) {
          await componentInteraction.reply({
            content: "このメニューはコマンドを実行したユーザーだけが操作できます。",
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        const selectedIndex = Number.parseInt(componentInteraction.values[0], 10);
        await componentInteraction.update(buildCardMessage(cards, selectedIndex));
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
