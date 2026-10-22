import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { CARD_RARITIES } from "./card-site.js";
import { CARD_COLORS } from "./oshi-card-api.js";

const queryDescription = "Card number or English name with an optional rarity anywhere (example: UR shiori)";
const addQueryOption = (builder, name, description = queryDescription) => builder.addStringOption(option => option
  .setName(name)
  .setDescription(description)
  .setRequired(true)
  .setMinLength(2)
  .setMaxLength(100));
const titleCase = value => value[0] + value.slice(1).toLowerCase();

export const cardCommand = addQueryOption(new SlashCommandBuilder()
  .setName("card")
  .setDescription("Search Japanese and English Hololive cards by number or name"), "query");

export const randomCardCommand = new SlashCommandBuilder()
  .setName("randomcard")
  .setDescription("Pull a random Hololive card")
  .addStringOption(option => option
    .setName("rarity")
    .setDescription("Only pull cards of this rarity")
    .addChoices(...[...CARD_RARITIES].map(rarity => ({ name: rarity, value: rarity }))))
  .addStringOption(option => option
    .setName("color")
    .setDescription("Only pull cards of this color")
    .addChoices(...CARD_COLORS.map(color => ({ name: titleCase(color), value: color }))));

export const dailyCardCommand = new SlashCommandBuilder()
  .setName("dailycard")
  .setDescription("Show today's card of the day");

export const compareCommand = addQueryOption(
  addQueryOption(new SlashCommandBuilder()
    .setName("compare")
    .setDescription("Show two cards side by side"), "first", "First card number or name"),
  "second",
  "Second card number or name"
);

export const priceCommand = addQueryOption(new SlashCommandBuilder()
  .setName("price")
  .setDescription("Compare English market prices across every printing of a card"), "query");

export const openPackCommand = new SlashCommandBuilder()
  .setName("openpack")
  .setDescription("Open a booster pack and add the cards to your collection in this server")
  .setContexts(InteractionContextType.Guild)
  .addStringOption(option => option
    .setName("set")
    .setDescription("Booster set to open")
    .setRequired(true)
    .setAutocomplete(true));

export const collectionCommand = new SlashCommandBuilder()
  .setName("collection")
  .setDescription("Show the cards someone has pulled in this server")
  .setContexts(InteractionContextType.Guild)
  .addUserOption(option => option
    .setName("user")
    .setDescription("Whose collection to show (defaults to you)"));

export const packCooldownCommand = new SlashCommandBuilder()
  .setName("packcooldown")
  .setDescription("Show or set how long members wait between packs in this server")
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addNumberOption(option => option
    .setName("hours")
    .setDescription("Hours between packs; 0 turns the cooldown off")
    .setMinValue(0)
    .setMaxValue(168));

export const binderCommand = new SlashCommandBuilder()
  .setName("binder")
  .setDescription("Flip through a set and see which cards someone has collected")
  .setContexts(InteractionContextType.Guild)
  .addStringOption(option => option
    .setName("set")
    .setDescription("Booster set (defaults to the set with the most cards collected)")
    .setAutocomplete(true))
  .addUserOption(option => option
    .setName("user")
    .setDescription("Whose binder to show (defaults to you)"));

export const leaderboardCommand = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Show this server's top collectors")
  .setContexts(InteractionContextType.Guild)
  .addStringOption(option => option
    .setName("category")
    .setDescription("What to rank by (defaults to unique cards)")
    .addChoices(
      { name: "Unique cards", value: "unique" },
      { name: "Packs opened", value: "packs" },
      { name: "UR/OUR/SEC pulls", value: "special" }
    ));

export const commands = [
  cardCommand,
  randomCardCommand,
  dailyCardCommand,
  compareCommand,
  priceCommand,
  openPackCommand,
  collectionCommand,
  binderCommand,
  leaderboardCommand,
  packCooldownCommand
];
