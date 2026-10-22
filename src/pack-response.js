import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import { rarityRank, SPECIAL_RARITIES } from "./packs.js";

const PACK_COLOR = 0x2bb9f3;
const SPECIAL_COLOR = 0xf5b301;

function cardLine(card) {
  const marker = SPECIAL_RARITIES.has(card.rarity) ? "✨ " : "";
  return `${marker}\`${card.rarity.padEnd(3)}\` ${card.cardNumber} — ${card.name}`;
}

export function buildPackMessage({ userName, setName, cards, best, imageFile = null, packsOpened = null }) {
  const sorted = [...cards].sort((left, right) => rarityRank(left.rarity) - rarityRank(right.rarity));
  const special = SPECIAL_RARITIES.has(best.rarity);
  const embed = new EmbedBuilder()
    .setColor(special ? SPECIAL_COLOR : PACK_COLOR)
    .setTitle(`${userName} opened ${setName}`)
    .setDescription(sorted.map(cardLine).join("\n"))
    .addFields({ name: special ? `✨ ${best.rarity} pull!` : "Best pull", value: `${best.name} — ${best.cardNumber} [${best.rarity}]` });
  if (packsOpened) embed.setFooter({ text: `Pack #${packsOpened} in this server • /collection to see your cards` });

  const imageUrl = imageFile ? `attachment://${imageFile.name}` : best.imageUrl;
  if (imageUrl) embed.setImage(imageUrl);
  const payload = { embeds: [embed] };
  if (imageFile) payload.files = [new AttachmentBuilder(imageFile.data, { name: imageFile.name })];
  return payload;
}

export function buildCollectionEmbed({ userName, summary, setSizes }) {
  const embed = new EmbedBuilder()
    .setColor(PACK_COLOR)
    .setTitle(`${userName}'s collection`);
  if (summary.totalCards === 0) {
    return embed.setDescription("No cards yet. Use `/openpack` to open your first pack!");
  }

  embed.setDescription([
    `**Packs opened:** ${summary.packsOpened}`,
    `**Cards pulled:** ${summary.totalCards}`,
    `**Unique cards:** ${summary.uniqueCards}`
  ].join("\n"));

  const setLines = summary.sets.map(({ setName, owned }) => {
    const size = setSizes.get(setName);
    if (!size) return `**${setName}:** ${owned}`;
    const percent = Math.min(100, (owned / size) * 100);
    return `**${setName}:** ${owned}/${size} (${percent.toFixed(1)}%)`;
  });
  embed.addFields({ name: "Set completion", value: setLines.join("\n").slice(0, 1024) });

  const rarest = [...summary.ownedCards]
    .sort((left, right) => rarityRank(right.rarity) - rarityRank(left.rarity) || left.cardNumber.localeCompare(right.cardNumber))
    .slice(0, 8);
  embed.addFields({
    name: "Rarest cards",
    value: rarest.map(card => `${cardLine(card)}${card.copies > 1 ? ` ×${card.copies}` : ""}`).join("\n").slice(0, 1024)
  });
  return embed;
}

export function formatCooldown(minutes) {
  if (minutes === 0) return "no cooldown";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours && `${hours} hour${hours === 1 ? "" : "s"}`, rest && `${rest} minute${rest === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(" ");
}
