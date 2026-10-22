import { readFileSync } from "node:fs";

export const PACK_RATES = JSON.parse(
  readFileSync(new URL("../data/pack-rates.json", import.meta.url), "utf8")
);
export const RARITY_ORDER = ["C", "U", "R", "RR", "SR", "SY", "OSR", "UR", "OUR", "SEC"];
export const SPECIAL_RARITIES = new Set(["UR", "OUR", "SEC"]);

export class PackError extends Error {}

export function toPackCard(card) {
  return {
    id: Number(card.siteId),
    siteId: card.siteId,
    cardNumber: card.number,
    name: card.name,
    rarity: card.rarity,
    cardType: card.metadata?.["カードタイプ"] === "エール" ? "CHEER" : card.metadata?.["カードタイプ"],
    imageUrl: card.imageUrl
  };
}

export function rarityRank(rarity) {
  const index = RARITY_ORDER.indexOf(rarity?.toUpperCase());
  return index === -1 ? -1 : index;
}

function pickWeighted(weights, random) {
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of weights) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return weights.at(-1)[0];
}

export function openPack(setCards, { rates = PACK_RATES, random = Math.random } = {}) {
  const cardsByRarity = new Map();
  for (const card of setCards) {
    if (card.cardType === "CHEER") continue;
    const rarity = card.rarity?.toUpperCase();
    if (!cardsByRarity.has(rarity)) cardsByRarity.set(rarity, []);
    cardsByRarity.get(rarity).push(card);
  }

  const pulled = [];
  const pulledIds = new Set();
  for (const slot of rates.slots) {
    // Rarities missing from this set are dropped and the remaining odds rescale.
    const weights = Object.entries(slot.rarities)
      .filter(([rarity, weight]) => weight > 0 && cardsByRarity.has(rarity));
    if (weights.length === 0) continue;
    for (let index = 0; index < slot.count; index += 1) {
      const pool = cardsByRarity.get(pickWeighted(weights, random));
      const fresh = pool.filter(card => !pulledIds.has(card.id));
      const choices = fresh.length > 0 ? fresh : pool;
      const card = choices[Math.floor(random() * choices.length)];
      pulledIds.add(card.id);
      pulled.push({ ...card, slot: slot.name });
    }
  }
  if (pulled.length === 0) throw new PackError("That set has no cards that can be pulled from a pack.");
  return pulled;
}

export function pullableCards(setCards, rates = PACK_RATES) {
  const rarities = new Set(rates.slots.flatMap(slot => Object.keys(slot.rarities)));
  return setCards.filter(card => card.cardType !== "CHEER" && rarities.has(card.rarity?.toUpperCase()));
}

export function sortPackCards(cards) {
  return [...cards].sort((left, right) => rarityRank(left.rarity) - rarityRank(right.rarity));
}

export function bestPull(cards) {
  return cards.reduce((best, card) => rarityRank(card.rarity) > rarityRank(best.rarity) ? card : best);
}
