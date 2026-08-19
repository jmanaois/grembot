import * as cheerio from "cheerio";

export const SITE_ORIGIN = "https://hololive-official-cardgame.com";
export const ENGLISH_SITE_ORIGIN = "https://en.hololive-official-cardgame.com";
const SEARCH_URL = `${SITE_ORIGIN}/cardlist/cardsearch/`;
const ENGLISH_SEARCH_URL = `${ENGLISH_SITE_ORIGIN}/cardlist/cardsearch/`;
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map();
const englishCache = new Map();

export class CardSiteError extends Error {}

export function normalizeCardId(value) {
  return value.trim();
}

function cleanText(element) {
  return element.text().replace(/\s+/g, " ").trim();
}

function absoluteUrl(path) {
  return new URL(path, SITE_ORIGIN).href;
}

export function parseSearchResults(html, requestedCardId) {
  const $ = cheerio.load(html);
  const wanted = normalizeCardId(requestedCardId).toLowerCase();
  const cards = [];

  $(".cardlist-Result_List_Txt > li").each((_, listItem) => {
    const item = $(listItem);
    const number = cleanText(item.find(".number").first());
    if (number.toLowerCase() !== wanted) return;

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

export function parseEnglishSearchResults(html, query) {
  const $ = cheerio.load(html);
  const normalizedQuery = query.trim().toLowerCase();
  const uniqueCards = new Map();

  $(".cardlist-Result_List_Txt > li").each((_, listItem) => {
    const item = $(listItem);
    const number = cleanText(item.find(".number").first());
    const name = cleanText(item.find(".name").first());
    if (!number || !name || !name.toLowerCase().includes(normalizedQuery)) return;
    if (!uniqueCards.has(number.toLowerCase())) uniqueCards.set(number.toLowerCase(), { number, name });
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

export async function resolveCardQuery(query) {
  const normalized = query.trim();
  if (/^[A-Za-z0-9-]{3,32}$/.test(normalized)) {
    const directCards = await findJapaneseCards(normalized);
    if (directCards.length > 0) return { cards: directCards, searchResults: [] };
  }

  const searchResults = await searchEnglishCardNames(normalized);
  for (const result of searchResults) {
    const cards = await findJapaneseCards(result.number);
    if (cards.length > 0) return { cards, searchResults };
  }
  return { cards: [], searchResults };
}
