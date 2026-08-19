import { parseCardQuery } from "./card-site.js";

export const OSHI_CARD_API_URL = "https://api.oshi.cards/graphql";
const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5_000;

const CARD_FIELDS = `
  id
  cardNumber
  name
  cardType
  color
  rarity
  setNames
  releaseDate
  illustrator
  imageUrl
  cardUrl
  tags
  hp
  bloomLevel
  batonPass
  life
  isBuzz
  supportType
  isLimited
  specialText
  extraText
  arts {
    name
    damage
    cost
    effectText
  }
  oshiSkills {
    name
    cost
    usageLimit
    effectText
    skillType
  }
  keywords {
    type
    title
    description
  }
  qna {
    question
    answer
  }
  tcgId
  pricingData {
    dailyPrices {
      date
      lowPrice
      midPrice
      highPrice
      marketPrice
      directLowPrice
    }
  }
`;

const CARD_QUERY = `
  query Card($cardNumber: String!) {
    card(cardNumber: $cardNumber) {
      ${CARD_FIELDS}
    }
  }
`;

const CARD_BY_ID_QUERY = `
  query CardById($id: Int!) {
    card(id: $id) {
      ${CARD_FIELDS}
    }
  }
`;

const MEMBER_CARDS_QUERY = `
  query MemberCards($name: String!) {
    cards(filter: { name: $name }, pageSize: 500) {
      nodes {
        id
        cardNumber
        name
        rarity
      }
    }
  }
`;

const SEARCH_CARDS_QUERY = `
  query SearchCards($search: String!) {
    cards(filter: { search: $search }, pageSize: 100) {
      nodes {
        id
        cardNumber
        name
        rarity
      }
    }
  }
`;

export class OshiCardApiError extends Error {}

function latestPrice(prices) {
  return prices.reduce((latest, price) => {
    if (!latest) return price;
    return Date.parse(price.date) > Date.parse(latest.date) ? price : latest;
  }, null);
}

export function selectEnglishPricing(cards, cardNumber, rarity) {
  const normalizedNumber = cardNumber.trim().toLowerCase();
  const normalizedRarity = rarity.trim().toUpperCase();
  const match = cards.find(card =>
    card.cardNumber?.trim().toLowerCase() === normalizedNumber
    && card.rarity?.trim().toUpperCase() === normalizedRarity
  );
  if (!match) return null;

  const price = latestPrice(match.pricingData?.dailyPrices ?? []);
  if (!price) return null;
  const priceFields = [
    price.lowPrice,
    price.midPrice,
    price.highPrice,
    price.marketPrice,
    price.directLowPrice
  ];
  if (!priceFields.some(value => Number.isFinite(value))) return null;

  return {
    tcgId: match.tcgId ?? null,
    updatedAt: price.date,
    lowPrice: price.lowPrice,
    midPrice: price.midPrice,
    highPrice: price.highPrice,
    marketPrice: price.marketPrice,
    directLowPrice: price.directLowPrice
  };
}

function titleCase(value) {
  return value
    .toLowerCase()
    .replace(/(^|[_\s])\w/g, match => match.toUpperCase())
    .replaceAll("_", " ");
}

function artText(art) {
  const lines = [];
  if (art.cost?.length) lines.push(`Cost: ${art.cost.map(titleCase).join(", ")}`);
  if (art.damage != null) lines.push(`Damage: ${art.damage}`);
  if (art.effectText) lines.push(art.effectText);
  return lines.join("\n") || "—";
}

function skillText(skill) {
  const lines = [];
  if (skill.cost) lines.push(`Cost: ${skill.cost}`);
  if (skill.usageLimit) lines.push(skill.usageLimit);
  if (skill.effectText) lines.push(skill.effectText);
  return lines.join("\n") || "—";
}

export function mapEnglishCard(card) {
  const metadata = {
    "Card type": titleCase(card.cardType ?? "Unknown"),
    Color: titleCase(card.color ?? "Unknown")
  };
  if (card.hp != null) metadata.HP = String(card.hp);
  if (card.bloomLevel) metadata["Bloom level"] = card.bloomLevel;
  if (card.batonPass?.length) metadata["Baton pass"] = card.batonPass.map(titleCase).join(", ");
  if (card.life != null) metadata.LIFE = String(card.life);
  if (card.supportType) metadata["Support type"] = card.supportType;
  if (card.isLimited) metadata.LIMITED = "Yes";
  if (card.isBuzz) metadata.Buzz = "Yes";
  if (card.illustrator) metadata.Illustrator = card.illustrator;
  if (card.releaseDate) metadata.Released = card.releaseDate;
  if (card.tags?.length) metadata.Tags = card.tags.join(" ");

  const sections = [];
  if (card.specialText) sections.push({ name: "Card text", value: card.specialText });
  if (card.extraText) sections.push({ name: "Extra text", value: card.extraText });
  for (const keyword of card.keywords ?? []) {
    sections.push({
      name: `${titleCase(keyword.type)} — ${keyword.title}`,
      value: keyword.description
    });
  }
  for (const art of card.arts ?? []) {
    sections.push({ name: `Art — ${art.name}`, value: artText(art) });
  }
  for (const skill of card.oshiSkills ?? []) {
    sections.push({
      name: `${skill.skillType === "SP_OSHI" ? "SP Oshi Skill" : "Oshi Skill"} — ${skill.name}`,
      value: skillText(skill)
    });
  }
  for (const qa of card.qna ?? []) {
    sections.push({ name: `Q&A — ${qa.question}`, value: qa.answer });
  }

  return {
    siteId: `en-${card.id}`,
    number: card.cardNumber,
    name: card.name,
    imageUrl: card.imageUrl,
    detailUrl: card.cardUrl,
    rarity: card.rarity,
    metadata,
    setNames: card.setNames ?? [],
    sections,
    edition: "english",
    englishPricing: selectEnglishPricing([card], card.cardNumber, card.rarity)
  };
}

export function createOshiCardApiClient({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  timeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
  const cardCache = new Map();
  const cardIdCache = new Map();
  const memberCardsCache = new Map();
  const searchCache = new Map();

  async function request(query, variables) {
    let response;
    try {
      response = await fetchImpl(OSHI_CARD_API_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "grembot/1.0 (Discord English card lookup)"
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      throw new OshiCardApiError(`The English card service could not be reached: ${error.message}`);
    }

    if (!response.ok) {
      throw new OshiCardApiError(`The English card service returned HTTP ${response.status}.`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new OshiCardApiError("The English card service returned an invalid response.");
    }
    if (payload.errors?.length) {
      throw new OshiCardApiError(`The English card service rejected the query: ${payload.errors[0].message}`);
    }
    return payload.data;
  }

  function cachedValue(cache, key) {
    const cached = cache.get(key);
    return cached && cached.expiresAt > now() ? cached.value : undefined;
  }

  function cacheValue(cache, key, value) {
    cache.set(key, { value, expiresAt: now() + CACHE_TTL_MS });
    return value;
  }

  async function getCard(cardNumber) {
    const key = cardNumber.toLowerCase();
    const cached = cachedValue(cardCache, key);
    if (cached !== undefined) return cached;
    const data = await request(CARD_QUERY, { cardNumber });
    const card = data?.card ?? null;
    if (card) cacheValue(cardIdCache, card.id, card);
    return cacheValue(cardCache, key, card);
  }

  async function getCardById(id) {
    const cached = cachedValue(cardIdCache, id);
    if (cached !== undefined) return cached;
    const data = await request(CARD_BY_ID_QUERY, { id });
    return cacheValue(cardIdCache, id, data?.card ?? null);
  }

  async function getMemberCardSummaries(name) {
    const key = name.toLowerCase();
    const cached = cachedValue(memberCardsCache, key);
    if (cached !== undefined) return cached;
    const data = await request(MEMBER_CARDS_QUERY, { name });
    return cacheValue(memberCardsCache, key, data?.cards?.nodes ?? []);
  }

  async function searchCards(search) {
    const key = search.toLowerCase();
    const cached = cachedValue(searchCache, key);
    if (cached !== undefined) return cached;
    const data = await request(SEARCH_CARDS_QUERY, { search });
    return cacheValue(searchCache, key, data?.cards?.nodes ?? []);
  }

  async function findEnglishCardsByNumber(cardNumber, rarity = null) {
    const normalizedNumber = cardNumber.trim();
    const normalizedRarity = rarity?.trim().toUpperCase() ?? null;
    if (!/^[A-Za-z0-9-]{3,32}$/.test(normalizedNumber)) return [];

    const seedCard = await getCard(normalizedNumber);
    if (!seedCard) return [];
    const summaries = await getMemberCardSummaries(seedCard.name);
    const matchingSummaries = summaries.filter(card =>
      card.cardNumber?.toLowerCase() === normalizedNumber.toLowerCase()
      && (!normalizedRarity || card.rarity?.toUpperCase() === normalizedRarity)
    );
    if (!matchingSummaries.some(card => card.id === seedCard.id)
      && (!normalizedRarity || seedCard.rarity?.toUpperCase() === normalizedRarity)) {
      matchingSummaries.unshift(seedCard);
    }

    const variants = await Promise.all(matchingSummaries.map(card =>
      card.id === seedCard.id ? seedCard : getCardById(card.id)
    ));
    return variants.filter(Boolean).map(mapEnglishCard);
  }

  async function searchEnglishCardSummaries(search, rarity = null) {
    const normalizedSearch = search.trim();
    const normalizedRarity = rarity?.trim().toUpperCase() ?? null;
    if (normalizedSearch.length < 2 || normalizedSearch.length > 100) return [];
    return (await searchCards(normalizedSearch))
      .filter(card => !normalizedRarity || card.rarity?.toUpperCase() === normalizedRarity)
      .sort((left, right) => {
        const leftExact = left.name.toLowerCase() === normalizedSearch.toLowerCase() ? 0 : 1;
        const rightExact = right.name.toLowerCase() === normalizedSearch.toLowerCase() ? 0 : 1;
        return leftExact - rightExact
          || left.name.localeCompare(right.name)
          || left.cardNumber.localeCompare(right.cardNumber)
          || left.id - right.id;
      });
  }

  async function resolveEnglishCardQuery(query) {
    const { lookupQuery, rarity } = parseCardQuery(query);
    if (!lookupQuery) return { cards: [], searchResults: [], rarity, edition: "english" };

    if (/^[A-Za-z0-9-]{3,32}$/.test(lookupQuery)) {
      const directCards = await findEnglishCardsByNumber(lookupQuery, rarity);
      if (directCards.length > 0) {
        return { cards: directCards, searchResults: [], rarity, edition: "english" };
      }
    }

    const matches = await searchEnglishCardSummaries(lookupQuery, rarity);
    if (matches.length === 0) return { cards: [], searchResults: [], rarity, edition: "english" };

    const choicesByNumber = new Map();
    for (const card of matches) {
      if (!choicesByNumber.has(card.cardNumber)) {
        choicesByNumber.set(card.cardNumber, { number: card.cardNumber, name: card.name, rarities: [] });
      }
      const choice = choicesByNumber.get(card.cardNumber);
      if (!choice.rarities.includes(card.rarity)) choice.rarities.push(card.rarity);
    }
    const searchResults = [...choicesByNumber.values()].slice(0, 25);
    const cards = await findEnglishCardsByNumber(searchResults[0].number, rarity);
    return { cards, searchResults, rarity, edition: "english" };
  }

  return {
    findEnglishCardsByNumber,
    resolveEnglishCardQuery,
    searchEnglishCardSummaries,

    async getEnglishCardPricing(cardNumber, rarity) {
      const normalizedNumber = cardNumber.trim();
      const normalizedRarity = rarity.trim();
      if (!/^[A-Za-z0-9-]{3,32}$/.test(normalizedNumber) || !normalizedRarity) return null;

      const seedCard = await getCard(normalizedNumber);
      if (!seedCard) return null;
      const seedPricing = selectEnglishPricing([seedCard], normalizedNumber, normalizedRarity);
      if (seedCard.rarity?.trim().toUpperCase() === normalizedRarity.toUpperCase()) {
        return seedPricing;
      }
      const variants = await findEnglishCardsByNumber(normalizedNumber, normalizedRarity);
      return variants[0]?.englishPricing ?? null;
    }
  };
}

const defaultClient = createOshiCardApiClient();

export function getEnglishCardPricing(cardNumber, rarity) {
  return defaultClient.getEnglishCardPricing(cardNumber, rarity);
}

export function findEnglishCardsByNumber(cardNumber, rarity = null) {
  return defaultClient.findEnglishCardsByNumber(cardNumber, rarity);
}

export function searchEnglishCardSummaries(search, rarity = null) {
  return defaultClient.searchEnglishCardSummaries(search, rarity);
}

export function resolveEnglishCardQuery(query) {
  return defaultClient.resolveEnglishCardQuery(query);
}
