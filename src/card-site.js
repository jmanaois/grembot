import * as cheerio from "cheerio";

export const SITE_ORIGIN = "https://hololive-official-cardgame.com";
export const ENGLISH_SITE_ORIGIN = "https://en.hololive-official-cardgame.com";
const SEARCH_URL = `${SITE_ORIGIN}/cardlist/cardsearch/`;
const ENGLISH_SEARCH_URL = `${ENGLISH_SITE_ORIGIN}/cardlist/cardsearch/`;
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map();
const englishCache = new Map();
const japaneseRarityCache = new Map();

export class CardSiteError extends Error {}

export const CARD_RARITIES = new Set([
  "RR", "R", "U", "C", "OSR", "OC", "SEC", "OUR", "HR", "UR", "SY", "SR", "S", "P"
]);

export function normalizeCardId(value) {
  return value.trim();
}

export function parseCardQuery(value) {
  const normalized = value.trim().replace(/\s+/g, " ");
  const separatorIndex = normalized.lastIndexOf(" ");
  if (separatorIndex === -1) return { lookupQuery: normalized, rarity: null };

  const possibleRarity = normalized.slice(separatorIndex + 1).toUpperCase();
  if (!CARD_RARITIES.has(possibleRarity)) return { lookupQuery: normalized, rarity: null };
  return {
    lookupQuery: normalized.slice(0, separatorIndex).trim(),
    rarity: possibleRarity
  };
}

function cleanText(element) {
  return element.text().replace(/\s+/g, " ").trim();
}

function absoluteUrl(path) {
  return new URL(path, SITE_ORIGIN).href;
}

export function parseJapaneseCards(html) {
  const $ = cheerio.load(html);
  const cards = [];

  $(".cardlist-Result_List_Txt > li").each((_, listItem) => {
    const item = $(listItem);
    const number = cleanText(item.find(".number").first());
    if (!number) return;

    const link = item.find("a").first().attr("href");
    const image = item.find(".img img").first().attr("src");
    if (!link || !image) return;

    const detailUrl = new URL(link, SITE_ORIGIN);
    const siteId = detailUrl.searchParams.get("id");
    if (!siteId || !/^\d+$/.test(siteId)) return;

    const metadata = {};
    item.find(".info dl").each((_, dl) => {
      const children = $(dl).children();
      for (let index = 0; index < children.length; index += 1) {
        const child = children.eq(index);
        if (!child.is("dt")) continue;
        const value = children.eq(index + 1);
        if (!value.is("dd")) continue;
        const key = cleanText(child);
        metadata[key] = cleanText(value) || value.find("img").attr("alt")?.trim() || "—";
      }
    });

    const sections = [];
    item.find(".center-Txtarea > div").each((_, sectionElement) => {
      const section = $(sectionElement);
      if (section.hasClass("info") || section.hasClass("txtarea-Btn")) return;
      const paragraphs = section.children("p");
      if (paragraphs.length < 2) return;
      const name = cleanText(paragraphs.first());
      const value = paragraphs.slice(1).map((__, paragraph) => cleanText($(paragraph))).get().join("\n");
      if (name && value) sections.push({ name, value });
    });

    cards.push({
      siteId,
      number,
      name: cleanText(item.find(".name").first()),
      imageUrl: absoluteUrl(image),
      detailUrl: absoluteUrl(`/cardlist/?id=${siteId}`),
      rarity: metadata["レアリティ"] ?? "不明",
      metadata,
      sections
    });
  });

  return cards;
}

export function parseSearchResults(html, requestedCardId) {
  const wanted = normalizeCardId(requestedCardId).toLowerCase();
  return parseJapaneseCards(html).filter(card => card.number.toLowerCase() === wanted);
}

export function parseEnglishSearchResults(html, query) {
  const $ = cheerio.load(html);
  const normalizedQuery = query.trim().toLowerCase();
  const uniqueCards = new Map();

  $(".cardlist-Result_List_Txt > li").each((_, listItem) => {
    const item = $(listItem);
    const number = cleanText(item.find(".number").first());
    const name = cleanText(item.find(".name").first());
    if (!number || !name || !name.toLowerCase().includes(normalizedQuery)) return;

    let rarity = "";
    item.find(".info dt").each((__, term) => {
      if (cleanText($(term)).toLowerCase() === "rarity") rarity = cleanText($(term).next("dd"));
    });

    const key = number.toLowerCase();
    if (!uniqueCards.has(key)) uniqueCards.set(key, { number, name, rarities: [] });
    const result = uniqueCards.get(key);
    if (rarity && !result.rarities.includes(rarity)) result.rarities.push(rarity);
  });

  return [...uniqueCards.values()]
    .sort((left, right) => {
      const leftExact = left.name.toLowerCase() === normalizedQuery ? 0 : 1;
      const rightExact = right.name.toLowerCase() === normalizedQuery ? 0 : 1;
      return leftExact - rightExact || left.name.localeCompare(right.name) || left.number.localeCompare(right.number);
    })
    .slice(0, 25);
}

async function fetchCatalogueHtml(url, expectedOrigin) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "grembot/1.0 (Discord card lookup; Japanese catalogue)"
    },
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) throw new CardSiteError(`The card catalogue returned HTTP ${response.status}.`);
  if (new URL(response.url).hostname !== new URL(expectedOrigin).hostname) {
    throw new CardSiteError("The card catalogue redirected to an unexpected host.");
  }
  return response.text();
}

export async function findJapaneseCards(cardId) {
  const normalized = normalizeCardId(cardId);
  if (!/^[A-Za-z0-9-]{3,32}$/.test(normalized)) {
    throw new CardSiteError("Card IDs may only contain letters, numbers, and hyphens.");
  }

  const key = normalized.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.cards;

  const url = new URL(SEARCH_URL);
  url.searchParams.set("keyword", normalized);
  url.searchParams.set("view", "text");
  url.searchParams.set("sort", "no");
  const cards = parseSearchResults(await fetchCatalogueHtml(url, SITE_ORIGIN), normalized);
  cache.set(key, { cards, expiresAt: Date.now() + CACHE_TTL_MS });
  return cards;
}

export async function searchEnglishCardNames(query) {
  const normalized = query.trim();
  if (normalized.length < 2 || normalized.length > 100) {
    throw new CardSiteError("English card-name searches must be between 2 and 100 characters.");
  }

  const key = normalized.toLowerCase();
  const cached = englishCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.results;

  const url = new URL(ENGLISH_SEARCH_URL);
  url.searchParams.set("keyword", normalized);
  url.searchParams.set("view", "text");
  url.searchParams.set("sort", "no");
  const results = parseEnglishSearchResults(
    await fetchCatalogueHtml(url, ENGLISH_SITE_ORIGIN),
    normalized
  );
  englishCache.set(key, { results, expiresAt: Date.now() + CACHE_TTL_MS });
  return results;
}

export async function searchJapaneseCardsByNameAndRarity(name, rarity) {
  const normalizedName = name.trim();
  const normalizedRarity = rarity.toUpperCase();
  if (!normalizedName || !CARD_RARITIES.has(normalizedRarity)) return [];

  const key = `${normalizedName.toLowerCase()}|${normalizedRarity}`;
  const cached = japaneseRarityCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.cards;

  const url = new URL(SEARCH_URL);
  url.searchParams.set("keyword", normalizedName);
  url.searchParams.set("rare[0]", normalizedRarity);
  url.searchParams.set("view", "text");
  url.searchParams.set("sort", "no");
  const cards = parseJapaneseCards(await fetchCatalogueHtml(url, SITE_ORIGIN))
    .filter(card => card.name === normalizedName && card.rarity.toUpperCase() === normalizedRarity);
  japaneseRarityCache.set(key, { cards, expiresAt: Date.now() + CACHE_TTL_MS });
  return cards;
}

export async function resolveCardQuery(query) {
  const { lookupQuery, rarity } = parseCardQuery(query);
  const filterRarity = cards => rarity
    ? cards.filter(card => card.rarity.toUpperCase() === rarity)
    : cards;

  if (/^[A-Za-z0-9-]{3,32}$/.test(lookupQuery)) {
    const allDirectCards = await findJapaneseCards(lookupQuery);
    if (allDirectCards.length > 0) {
      return { cards: filterRarity(allDirectCards), searchResults: [], rarity };
    }
  }

  const allSearchResults = await searchEnglishCardNames(lookupQuery);
  if (!rarity) {
    for (const result of allSearchResults) {
      const cards = await findJapaneseCards(result.number);
      if (cards.length > 0) return { cards, searchResults: allSearchResults, rarity };
    }
    return { cards: [], searchResults: allSearchResults, rarity };
  }

  for (const result of allSearchResults) {
    const seedCards = await findJapaneseCards(result.number);
    if (seedCards.length === 0) continue;

    const rarityMatches = await searchJapaneseCardsByNameAndRarity(seedCards[0].name, rarity);
    if (rarityMatches.length === 0) continue;

    const matchingEnglishName = result.name;
    const choices = [...new Set(rarityMatches.map(card => card.number))].map(number => ({
      number,
      name: matchingEnglishName,
      rarities: [rarity]
    }));
    const cards = rarityMatches.filter(card => card.number === choices[0].number);
    return { cards, searchResults: choices, rarity };
  }

  return { cards: [], searchResults: [], rarity };
}
