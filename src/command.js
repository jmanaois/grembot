import { SlashCommandBuilder } from "discord.js";
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

export const commands = [cardCommand, randomCardCommand, dailyCardCommand, compareCommand, priceCommand];
