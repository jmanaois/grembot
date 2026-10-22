import { readFileSync } from "node:fs";

export const PACK_RATES = JSON.parse(
  readFileSync(new URL("../data/pack-rates.json", import.meta.url), "utf8")
);
export const RARITY_ORDER = ["C", "U", "R", "S", "RR", "SR", "SY", "OSR", "UR", "HR", "OUR", "SEC"];
export const SPECIAL_RARITIES = new Set(["UR", "HR", "OUR", "SEC"]);

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

// A rarity the set lacks hands its weight to the most common rarity left in the slot,
// so missing low rarities never make the rare ones more likely.
export function slotWeights(slot, hasRarity = () => true) {
  const entries = Object.entries(slot.rarities).filter(([, weight]) => weight > 0);
  const present = entries.filter(([rarity]) => hasRarity(rarity));
  if (present.length === 0) return [];
  const missingWeight = entries
    .filter(([rarity]) => !hasRarity(rarity))
    .reduce((sum, [, weight]) => sum + weight, 0);
  const lowest = present.reduce((low, entry) => rarityRank(entry[0]) < rarityRank(low[0]) ? entry : low);
  return present.map(([rarity, weight]) => [rarity, rarity === lowest[0] ? weight + missingWeight : weight]);
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
    const weights = slotWeights(slot, rarity => cardsByRarity.has(rarity));
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

export function countPullableByRarity(setCards, rates = PACK_RATES) {
  const counts = new Map();
  for (const card of pullableCards(setCards, rates)) {
    const rarity = card.rarity.toUpperCase();
    counts.set(rarity, (counts.get(rarity) ?? 0) + 1);
  }
  return counts;
}

// Odds per slot draw and per pack. Without card counts, every rarity in the rates is assumed present.
// Per-card odds ignore the no-duplicates-in-a-pack rule, so they are close but not exact for common slots.
export function packOdds({ rates = PACK_RATES, cardCounts = null } = {}) {
  return rates.slots.map(slot => {
    const weights = slotWeights(slot, rarity => !cardCounts || cardCounts.get(rarity) > 0);
    const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
    return {
      name: slot.name,
      count: slot.count,
      rarities: weights
        .map(([rarity, weight]) => {
          const chance = weight / total;
          const cards = cardCounts?.get(rarity) ?? null;
          return {
            rarity,
            chance,
            perPack: 1 - (1 - chance) ** slot.count,
            cards,
            perCardPerPack: cards ? 1 - (1 - chance / cards) ** slot.count : null
          };
        })
        .sort((left, right) => rarityRank(left.rarity) - rarityRank(right.rarity))
    };
  });
}

export function sortPackCards(cards) {
  return [...cards].sort((left, right) => rarityRank(left.rarity) - rarityRank(right.rarity));
}

export function bestPull(cards) {
  return cards.reduce((best, card) => rarityRank(card.rarity) > rarityRank(best.rarity) ? card : best);
}
