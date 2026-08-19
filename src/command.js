import { SlashCommandBuilder } from "discord.js";

export const cardCommand = new SlashCommandBuilder()
  .setName("card")
  .setDescription("Search Japanese Hololive cards by card number or English name")
  .addStringOption(option => option
    .setName("query")
    .setDescription("Card number or English name with an optional rarity anywhere (example: UR shiori)")
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(100));
