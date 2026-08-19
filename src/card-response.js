import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from "discord.js";

const EMBED_COLOR = 0x2bb9f3;
const MAX_FIELD_VALUE = 1024;

function truncate(value, max = MAX_FIELD_VALUE) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function buildCardEmbed(card, variantIndex, variantCount) {
  const summary = Object.entries(card.metadata)
    .filter(([key]) => !["レアリティ", "収録商品"].includes(key))
    .map(([key, value]) => `**${key}:** ${value}`)
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`${card.number} — ${card.name}`)
    .setURL(card.detailUrl)
    .setImage(card.imageUrl)
    .setFooter({
      text: `Japanese card catalogue • ${variantIndex + 1}/${variantCount} printing${variantCount === 1 ? "" : "s"}`
    });

  let characterBudget = 5_500 - card.number.length - card.name.length;
  const addFieldWithinBudget = (field) => {
    if (characterBudget <= field.name.length + 1) return;
    const value = truncate(field.value, Math.min(MAX_FIELD_VALUE, characterBudget - field.name.length));
    embed.addFields({ ...field, value });
    characterBudget -= field.name.length + value.length;
  };

  if (summary) addFieldWithinBudget({ name: "カード情報", value: summary, inline: true });
  if (card.metadata["収録商品"]) {
    addFieldWithinBudget({ name: "収録商品", value: card.metadata["収録商品"], inline: true });
  }
  for (const section of card.sections.slice(0, 20)) {
    addFieldWithinBudget({ name: truncate(section.name, 256), value: section.value });
  }
  return embed;
}

export function buildVariantComponents(cards, selectedIndex = 0) {
  if (cards.length < 2) return [];

  const menu = new StringSelectMenuBuilder()
    .setCustomId("card-variant")
    .setPlaceholder("別のレアリティ / 絵柄を選択")
    .addOptions(cards.slice(0, 25).map((card, index) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`${card.rarity} — ${card.number}`.slice(0, 100))
        .setDescription(`絵柄 ${index + 1} / ${cards.length}`)
        .setValue(String(index))
        .setDefault(index === selectedIndex)
    ));

  return [new ActionRowBuilder().addComponents(menu)];
}

export function buildSearchResultComponents(results, selectedNumber) {
  if (results.length < 2) return [];

  const menu = new StringSelectMenuBuilder()
    .setCustomId("card-result")
    .setPlaceholder("英語名の検索結果からカードを選択")
    .addOptions(results.slice(0, 25).map(result =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`${result.name} — ${result.number}`.slice(0, 100))
        .setValue(result.number)
        .setDefault(result.number.toLowerCase() === selectedNumber.toLowerCase())
    ));

  return [new ActionRowBuilder().addComponents(menu)];
}

export function buildCardMessage(cards, selectedIndex = 0) {
  const safeIndex = Math.min(Math.max(selectedIndex, 0), cards.length - 1);
  return {
    embeds: [buildCardEmbed(cards[safeIndex], safeIndex, cards.length)],
    components: buildVariantComponents(cards, safeIndex)
  };
}
