import "dotenv/config";
import { fileURLToPath } from "node:url";
import { Client, Events, GatewayIntentBits, MessageFlags, PermissionFlagsBits } from "discord.js";
import { findJapaneseCards, CardSiteError } from "./card-site.js";
import {
  buildCardMessage,
  buildCompareSummary,
  buildMultiCardMessage,
  buildPriceEmbed,
  buildSearchResultComponents
} from "./card-response.js";
import { extractInlineQueries, utcDateKey } from "./card-features.js";
import { loadCardExtras, lookupCards, lookupCardsForSummary } from "./card-lookup.js";
import { buildDailyCardMessage, startDailyCardSchedule } from "./daily-card.js";
import { openDatabase } from "./database.js";
import { createPackHandlers } from "./pack-commands.js";
import { PackError } from "./packs.js";
import {
  findEnglishCardsByNumber,
  getRandomCardSummary,
  OshiCardApiError
} from "./oshi-card-api.js";

if (!process.env.DISCORD_TOKEN) {
  throw new Error("DISCORD_TOKEN must be set. Copy .env.example to .env.");
}

const inlineLookupsEnabled = process.env.INLINE_LOOKUPS === "true";
const dailyCardChannelId = process.env.DAILY_CARD_CHANNEL_ID;
const dailyCardHourUtc = Number.parseInt(process.env.DAILY_CARD_HOUR_UTC ?? "15", 10);

const databasePath = process.env.DATABASE_PATH ?? fileURLToPath(new URL("../data/grembot.db", import.meta.url));
const db = openDatabase(databasePath);
const packHandlers = createPackHandlers(db);

const intents = [GatewayIntentBits.Guilds];
if (inlineLookupsEnabled) intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
const client = new Client({ intents });

client.once(Events.ClientReady, readyClient => {
  console.log(`Ready as ${readyClient.user.tag}`);
  if (dailyCardChannelId) {
    if (!Number.isInteger(dailyCardHourUtc) || dailyCardHourUtc < 0 || dailyCardHourUtc > 23) {
      console.error("DAILY_CARD_HOUR_UTC must be a whole number from 0 to 23; the card of the day is disabled.");
    } else {
      startDailyCardSchedule(readyClient, { channelId: dailyCardChannelId, postHourUtc: dailyCardHourUtc });
    }
  }
});

async function replyWithCards(interaction, resolved, notFoundMessage) {
  let cards = resolved.cards;
  const searchResults = resolved.searchResults;
  const requestedRarity = resolved.rarity;
  if (cards.length === 0) {
    await interaction.editReply(notFoundMessage);
    return;
  }

  let selectedVariant = 0;
  const canAttachFiles = interaction.appPermissions?.has(PermissionFlagsBits.AttachFiles) ?? false;
  const currentMessage = async () => {
    const { imageFile, englishPricing } = await loadCardExtras(cards[selectedVariant], { canAttachFiles });
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
        content: `Something went wrong while changing cards. Please run \`/${interaction.commandName}\` again.`,
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
    }
  });
  collector.on("end", () => interaction.editReply({ components: [] }).catch(() => {}));
}

const commandHandlers = {
  async card(interaction) {
    const query = interaction.options.getString("query", true);
    await interaction.deferReply();
    await replyWithCards(
      interaction,
      await lookupCards(query),
      `No Japanese or English card matched “${query}”. Check the card number, name, or rarity and try again.`
    );
  },

  async randomcard(interaction) {
    const rarity = interaction.options.getString("rarity");
    const color = interaction.options.getString("color");
    await interaction.deferReply();
    const summary = await getRandomCardSummary({ rarity, color });
    const resolved = summary ? await lookupCardsForSummary(summary) : { cards: [] };
    await replyWithCards(interaction, resolved, "No card matched those filters. Try a different rarity or color.");
  },

  async dailycard(interaction) {
    await interaction.deferReply();
    const canAttachFiles = interaction.appPermissions?.has(PermissionFlagsBits.AttachFiles) ?? false;
    const message = await buildDailyCardMessage(utcDateKey(), { canAttachFiles });
    await interaction.editReply(message ?? "Today's card could not be loaded. Please try again in a moment.");
  },

  async compare(interaction) {
    const queries = [interaction.options.getString("first", true), interaction.options.getString("second", true)];
    await interaction.deferReply();
    const results = await Promise.all(queries.map(lookupCards));
    const missing = queries.filter((_, index) => results[index].cards.length === 0);
    if (missing.length > 0) {
      await interaction.editReply(`No card matched ${missing.map(query => `“${query}”`).join(" or ")}.`);
      return;
    }
    const canAttachFiles = interaction.appPermissions?.has(PermissionFlagsBits.AttachFiles) ?? false;
    const entries = await Promise.all(results.map(async ({ cards: [card] }) =>
      ({ card, ...await loadCardExtras(card, { canAttachFiles }) })
    ));
    await interaction.editReply(buildMultiCardMessage(entries, buildCompareSummary(entries)));
  },

  async price(interaction) {
    const query = interaction.options.getString("query", true);
    await interaction.deferReply();
    const resolved = await lookupCards(query);
    if (resolved.cards.length === 0) {
      await interaction.editReply(`No card matched “${query}”.`);
      return;
    }
    const englishCards = await findEnglishCardsByNumber(resolved.cards[0].number, resolved.rarity);
    if (englishCards.length === 0) {
      await interaction.editReply(`${resolved.cards[0].number} has no English printing with price data yet.`);
      return;
    }
    await interaction.editReply({ embeds: [buildPriceEmbed(englishCards)] });
  },

  openpack: packHandlers.openpack,
  collection: packHandlers.collection,
  binder: packHandlers.binder,
  leaderboard: packHandlers.leaderboard,
  packcooldown: packHandlers.packcooldown
};

function describeError(error) {
  if (error instanceof PackError) return error.message;
  return error instanceof CardSiteError
    ? `Could not search the card catalogue: ${error.message}`
    : error instanceof OshiCardApiError
      ? `Could not search the English card catalogue: ${error.message}`
      : "Something went wrong while searching for that card. Please try again in a moment.";
}

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isAutocomplete()) {
    await packHandlers.autocomplete(interaction).catch(error => console.error(error));
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  const handler = commandHandlers[interaction.commandName];
  if (!handler) return;
  try {
    await handler(interaction);
  } catch (error) {
    console.error(error);
    const message = describeError(error);
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: message, embeds: [], components: [], files: [] }).catch(() => {});
    else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
});

if (inlineLookupsEnabled) {
  client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.inGuild()) return;
    const queries = extractInlineQueries(message.content);
    if (queries.length === 0) return;

    const permissions = message.channel.permissionsFor(client.user);
    if (!permissions?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) return;
    const canAttachFiles = permissions.has(PermissionFlagsBits.AttachFiles);

    try {
      await message.channel.sendTyping().catch(() => {});
      const results = await Promise.all(queries.map(query => lookupCards(query).catch(error => {
        console.warn(`Inline lookup failed for “${query}”.`, error);
        return { cards: [] };
      })));
      const found = results.flatMap(result => result.cards.slice(0, 1));
      const missing = queries.filter((_, index) => results[index].cards.length === 0);
      if (found.length === 0 && missing.length === 0) return;

      const entries = await Promise.all(found.map(async card =>
        ({ card, ...await loadCardExtras(card, { canAttachFiles }) })
      ));
      const content = missing.length > 0 ? `No card matched ${missing.map(query => `“${query}”`).join(", ")}.` : undefined;
      await message.reply({
        ...buildMultiCardMessage(entries, content),
        allowedMentions: { repliedUser: false, parse: [] }
      });
    } catch (error) {
      console.error(error);
    }
  });
}

await client.login(process.env.DISCORD_TOKEN);
