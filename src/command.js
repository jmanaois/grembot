import { SlashCommandBuilder } from "discord.js";

export const cardCommand = new SlashCommandBuilder()
  .setName("card")
  .setDescription("日本語版ホロカをカード番号または英語名で検索します")
  .addStringOption(option => option
    .setName("query")
    .setDescription("カード番号または英語名。末尾にレアリティも指定可（例: ayame sec）")
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(100));
