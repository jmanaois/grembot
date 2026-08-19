import { SlashCommandBuilder } from "discord.js";

export const cardCommand = new SlashCommandBuilder()
  .setName("card")
  .setDescription("日本語版ホロカをカード番号で検索します")
  .addStringOption(option => option
    .setName("id")
    .setDescription("カード番号（例: hBP01-001）")
    .setRequired(true)
    .setMaxLength(32));
