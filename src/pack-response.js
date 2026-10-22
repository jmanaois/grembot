import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from "discord.js";
import { rarityRank, sortPackCards, SPECIAL_RARITIES } from "./packs.js";

const PACK_COLOR = 0x2bb9f3;
const SPECIAL_COLOR = 0xf5b301;

function cardLine(card) {
  const marker = SPECIAL_RARITIES.has(card.rarity) ? "✨ " : "";
  return `${marker}\`${card.rarity.padEnd(3)}\` ${card.cardNumber} — ${card.name}`;
}

const OPEN_PACK_BUTTON_PREFIX = "openpack:";

export function openPackButtonId(setCode) {
  return `${OPEN_PACK_BUTTON_PREFIX}${setCode}`;
}

export function parseOpenPackButtonId(customId) {
  if (!customId.startsWith(OPEN_PACK_BUTTON_PREFIX)) return null;
  const code = customId.slice(OPEN_PACK_BUTTON_PREFIX.length);
  return /^[A-Za-z0-9]{2,16}$/.test(code) ? code : null;
}

export function buildPackMessage({ userName, set, cards, best, imageFile = null, packsOpened = null }) {
  const sorted = sortPackCards(cards);
  const special = SPECIAL_RARITIES.has(best.rarity);
  const embed = new EmbedBuilder()
    .setColor(special ? SPECIAL_COLOR : PACK_COLOR)
    .setTitle(`${userName} opened ${set.name}`)
    .setDescription(sorted.map(cardLine).join("\n"))
    .addFields({ name: special ? `✨ ${best.rarity} pull!` : "Best pull", value: `${best.name} — ${best.cardNumber} [${best.rarity}]` });
  if (packsOpened) embed.setFooter({ text: `Pack #${packsOpened} in this server • /collection to see your cards` });

  const imageUrl = imageFile ? `attachment://${imageFile.name}` : best.imageUrl;
  if (imageUrl) embed.setImage(imageUrl);
  const openAnother = new ButtonBuilder()
    .setCustomId(openPackButtonId(set.code))
    .setLabel(`Open another ${set.name}`.slice(0, 80))
    .setEmoji("🎴")
    .setStyle(ButtonStyle.Primary);
  const payload = { embeds: [embed], components: [new ActionRowBuilder().addComponents(openAnother)] };
  if (imageFile) payload.files = [new AttachmentBuilder(imageFile.data, { name: imageFile.name })];
  return payload;
}

export function buildCollectionEmbed({ userName, summary, sets }) {
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

  const setLines = sets.map(({ label, owned, size }) => {
    if (!size) return `**${label}:** ${owned}`;
    const percent = Math.min(100, (owned / size) * 100);
    return `**${label}:** ${owned}/${size} (${percent.toFixed(1)}%)`;
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

export const BINDER_PAGE_SIZE = 20;
export const BINDER_FILTERS = ["all", "owned", "missing"];
const BINDER_FILTER_LABELS = { all: "Showing all", owned: "Showing owned", missing: "Showing missing" };

export function sortBinderCards(cards) {
  return [...cards].sort((left, right) =>
    left.cardNumber.localeCompare(right.cardNumber) || rarityRank(left.rarity) - rarityRank(right.rarity) || left.id - right.id
  );
}

export function buildBinderPage({ userName, setName, cards, owned, page = 0, filter = "all" }) {
  const ownedCount = cards.filter(card => owned.has(card.id)).length;
  const shown = cards.filter(card =>
    filter === "all" || (filter === "owned") === owned.has(card.id)
  );
  const pageCount = Math.max(1, Math.ceil(shown.length / BINDER_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), pageCount - 1);
  const lines = shown
    .slice(safePage * BINDER_PAGE_SIZE, (safePage + 1) * BINDER_PAGE_SIZE)
    .map(card => {
      const copies = owned.get(card.id);
      const line = `\`${card.rarity.padEnd(3)}\` ${card.cardNumber} — ${card.name}`;
      return copies ? `✅ ${line}${copies > 1 ? ` ×${copies}` : ""}` : `▫️ ${line}`;
    });
  const percent = cards.length ? (ownedCount / cards.length) * 100 : 0;
  const rarestOwned = cards
    .filter(card => owned.has(card.id))
    .reduce((best, card) => !best || rarityRank(card.rarity) > rarityRank(best.rarity) ? card : best, null);

  const embed = new EmbedBuilder()
    .setColor(PACK_COLOR)
    .setTitle(`${userName}'s binder — ${setName}`)
    .setDescription([
      `**${ownedCount}/${cards.length}** collected (${percent.toFixed(1)}%)`,
      "",
      lines.length ? lines.join("\n") : filter === "missing" ? "Nothing missing. Set complete! 🎉" : "No cards here yet."
    ].join("\n").slice(0, 4096))
    .setFooter({ text: `Page ${safePage + 1}/${pageCount} • ${BINDER_FILTER_LABELS[filter]}` });
  if (rarestOwned?.imageUrl) embed.setThumbnail(rarestOwned.imageUrl);

  const nextFilter = BINDER_FILTERS[(BINDER_FILTERS.indexOf(filter) + 1) % BINDER_FILTERS.length];
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("binder-prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(safePage === 0),
    new ButtonBuilder().setCustomId("binder-next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(safePage >= pageCount - 1),
    new ButtonBuilder().setCustomId("binder-filter").setLabel(`Show ${nextFilter}`).setStyle(ButtonStyle.Primary)
  );
  return { embeds: [embed], components: [row], page: safePage, pageCount };
}

export const LEADERBOARD_CATEGORIES = {
  unique: { title: "Most unique cards", unit: ["unique card", "unique cards"] },
  packs: { title: "Most packs opened", unit: ["pack", "packs"] },
  special: { title: "Most UR/OUR/SEC pulls", unit: ["special pull", "special pulls"] }
};
const MEDALS = ["🥇", "🥈", "🥉"];

export function buildLeaderboardEmbed({ guildName, category, rows, viewerId, limit = 10 }) {
  const { title, unit } = LEADERBOARD_CATEGORIES[category];
  const describe = row => `${MEDALS[row.rank - 1] ?? `**${row.rank}.**`} <@${row.userId}> — ${row.score} ${unit[row.score === 1 ? 0 : 1]}`;
  const embed = new EmbedBuilder()
    .setColor(PACK_COLOR)
    .setTitle(`${title}${guildName ? ` in ${guildName}` : ""}`);
  if (rows.length === 0) return embed.setDescription("Nobody has opened a pack yet. Try `/openpack`!");

  const lines = rows.slice(0, limit).map(describe);
  const viewer = rows.find(row => row.userId === viewerId);
  if (viewer && !rows.slice(0, limit).includes(viewer)) lines.push("…", describe(viewer));
  return embed.setDescription(lines.join("\n"));
}
