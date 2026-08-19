import "dotenv/config";
import { Client, Events, GatewayIntentBits, MessageFlags, PermissionFlagsBits } from "discord.js";
import { findJapaneseCards, resolveCardQuery, CardSiteError } from "./card-site.js";
import { buildCardMessage, buildSearchResultComponents } from "./card-response.js";
import { getCardImageFile } from "./card-image.js";
import {
  findEnglishCardsByNumber,
  getEnglishCardPricing,
  OshiCardApiError,
  resolveEnglishCardQuery
} from "./oshi-card-api.js";

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
      let resolved = await resolveCardQuery(query);
      if (resolved.cards.length === 0) {
        resolved = await resolveEnglishCardQuery(query);
      }
      let cards = resolved.cards;
      const searchResults = resolved.searchResults;
      const requestedRarity = resolved.rarity;
      if (cards.length === 0) {
        await interaction.editReply(`No Japanese or English card matched “${query}”. Check the card number, name, or rarity and try again.`);
        return;
      }

      let selectedVariant = 0;
      const canAttachFiles = interaction.appPermissions?.has(PermissionFlagsBits.AttachFiles) ?? false;
      const currentMessage = async () => {
        const selectedCard = cards[selectedVariant];
        const imagePromise = canAttachFiles && selectedCard.imageUrl
          ? getCardImageFile(selectedCard).catch(error => {
            console.warn(`Could not attach ${selectedCard.imageUrl}; using the remote image URL.`, error);
            return null;
          })
          : Promise.resolve(null);
        const pricingPromise = selectedCard.edition === "english"
          ? Promise.resolve(selectedCard.englishPricing)
          : getEnglishCardPricing(selectedCard.number, selectedCard.rarity)
            .catch(error => {
              console.warn(`Could not load English pricing for ${selectedCard.number} [${selectedCard.rarity}].`, error);
              return null;
            });
        const [imageFile, englishPricing] = await Promise.all([imagePromise, pricingPromise]);
        const cardMessage = buildCardMessage(cards, selectedVariant, imageFile, englishPricing);
        return {
          ...cardMessage,
          components: [
            ...buildSearchResultComponents(searchResults, cards[0].number, requestedRarity),
            ...cardMessage.components
          ]
        };
      };

      const message = await interaction.editReply(await currentMessage());
      if (cards.length < 2 && searchResults.length < 2) return;

      const collector = message.createMessageComponentCollector({ time: 10 * 60 * 1000 });
      collector.on("collect", async componentInteraction => {
        if (!componentInteraction.isStringSelectMenu() || !["card-variant", "card-result"].includes(componentInteraction.customId)) return;
        if (componentInteraction.user.id !== interaction.user.id) {
          await componentInteraction.reply({
            content: "Only the person who ran this command can use this menu.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        if (componentInteraction.customId === "card-variant") {
          selectedVariant = Number.parseInt(componentInteraction.values[0], 10);
          await componentInteraction.deferUpdate();
          await interaction.editReply(await currentMessage());
          return;
        }

        await componentInteraction.deferUpdate();
        try {
          const selectedNumber = componentInteraction.values[0];
          const selectedCards = cards[0]?.edition === "english"
            ? await findEnglishCardsByNumber(selectedNumber, requestedRarity)
            : (await findJapaneseCards(selectedNumber)).filter(card =>
              !requestedRarity || card.rarity.toUpperCase() === requestedRarity
            );
          if (selectedCards.length === 0) {
            await interaction.followUp({
              content: "No card matched that selection.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }
          cards = selectedCards;
          selectedVariant = 0;
          await interaction.editReply(await currentMessage());
        } catch (error) {
          console.error(error);
          await interaction.followUp({
            content: "Something went wrong while changing cards. Please run `/card` again.",
            flags: MessageFlags.Ephemeral
          }).catch(() => {});
        }
      });
      collector.on("end", () => interaction.editReply({ components: [] }).catch(() => {}));
    }
  } catch (error) {
    console.error(error);
    const message = error instanceof CardSiteError
      ? `Could not search the card catalogue: ${error.message}`
      : error instanceof OshiCardApiError
        ? `Could not search the English card catalogue: ${error.message}`
      : "Something went wrong while searching for that card. Please try again in a moment.";
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: message, embeds: [], components: [] }).catch(() => {});
    else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
});

await client.login(process.env.DISCORD_TOKEN);
