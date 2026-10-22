import { resolveCardQuery } from "./card-site.js";
import { getCardImageFile } from "./card-image.js";
import { dailyCardIndex } from "./card-features.js";
import {
  countCards,
  findEnglishCardsByNumber,
  getCardSummaryAt,
  getEnglishCardPricing,
  resolveEnglishCardQuery
} from "./oshi-card-api.js";

export async function lookupCards(query) {
  const resolved = await resolveCardQuery(query);
  if (resolved.cards.length > 0) return resolved;
  return resolveEnglishCardQuery(query);
}

export async function loadCardExtras(card, { canAttachFiles }) {
  const imagePromise = canAttachFiles && card.imageUrl
    ? getCardImageFile(card).catch(error => {
      console.warn(`Could not attach ${card.imageUrl}; using the remote image URL.`, error);
      return null;
    })
    : Promise.resolve(null);
  const pricingPromise = card.edition === "english"
    ? Promise.resolve(card.englishPricing)
    : getEnglishCardPricing(card.number, card.rarity)
      .catch(error => {
        console.warn(`Could not load English pricing for ${card.number} [${card.rarity}].`, error);
        return null;
      });
  const [imageFile, englishPricing] = await Promise.all([imagePromise, pricingPromise]);
  return { imageFile, englishPricing };
}

export async function lookupCardsForSummary(summary) {
  const resolved = await resolveCardQuery(`${summary.cardNumber} ${summary.rarity}`).catch(error => {
    console.warn(`Could not load the Japanese edition of ${summary.cardNumber}.`, error);
    return { cards: [] };
  });
  if (resolved.cards.length > 0) return { cards: resolved.cards, searchResults: [], rarity: summary.rarity };
  const cards = await findEnglishCardsByNumber(summary.cardNumber, summary.rarity);
  return { cards, searchResults: [], rarity: summary.rarity };
}

export async function getDailyCardSummary(dateKey) {
  const total = await countCards();
  const index = dailyCardIndex(dateKey, total);
  return index === -1 ? null : getCardSummaryAt(index);
}
