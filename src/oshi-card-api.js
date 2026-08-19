export const OSHI_CARD_API_URL = "https://api.oshi.cards/graphql";
const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5_000;

const CARD_QUERY = `
  query Card($cardNumber: String!) {
    card(cardNumber: $cardNumber) {
      name
      cardNumber
      rarity
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
    }
  }
`;

const MEMBER_PRICES_QUERY = `
  query MemberPrices($name: String!) {
    cards(filter: { name: $name }, pageSize: 500) {
      nodes {
        cardNumber
        rarity
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

export function createOshiCardApiClient({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  timeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
  const cardCache = new Map();
  const memberPricesCache = new Map();

  async function request(query, variables) {
    let response;
    try {
      response = await fetchImpl(OSHI_CARD_API_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "grembot/1.0 (Discord card lookup; English pricing)"
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      throw new OshiCardApiError(`The English pricing service could not be reached: ${error.message}`);
    }

    if (!response.ok) {
      throw new OshiCardApiError(`The English pricing service returned HTTP ${response.status}.`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new OshiCardApiError("The English pricing service returned an invalid response.");
    }
    if (payload.errors?.length) {
      throw new OshiCardApiError(`The English pricing service rejected the query: ${payload.errors[0].message}`);
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
    return cacheValue(cardCache, key, data?.card ?? null);
  }

  async function getMemberCards(name) {
    const key = name.toLowerCase();
    const cached = cachedValue(memberPricesCache, key);
    if (cached !== undefined) return cached;
    const data = await request(MEMBER_PRICES_QUERY, { name });
    return cacheValue(memberPricesCache, key, data?.cards?.nodes ?? []);
  }

  return {
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
      return selectEnglishPricing(
        await getMemberCards(seedCard.name),
        normalizedNumber,
        normalizedRarity
      );
    }
  };
}

const defaultClient = createOshiCardApiClient();

export function getEnglishCardPricing(cardNumber, rarity) {
  return defaultClient.getEnglishCardPricing(cardNumber, rarity);
}
