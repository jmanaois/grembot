import test from "node:test";
import assert from "node:assert/strict";
import {
  createOshiCardApiClient,
  mapEnglishCard,
  OshiCardApiError,
  selectEnglishPricing
} from "../src/oshi-card-api.js";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

const englishCard = {
  id: 2001,
  cardNumber: "hBP05-001",
  name: "English Only Member",
  cardType: "HOLOMEM",
  color: "RED",
  rarity: "RR",
  setNames: ["Booster Pack – Test Set"],
  releaseDate: "August 21, 2026",
  illustrator: "Test Artist",
  imageUrl: "https://en.hololive-official-cardgame.com/wp-content/images/card.png",
  cardUrl: "https://en.hololive-official-cardgame.com/cardlist/?id=2001",
  tags: ["#EN"],
  hp: 100,
  bloomLevel: "Debut",
  batonPass: ["COLORLESS"],
  life: null,
  isBuzz: false,
  supportType: null,
  isLimited: false,
  specialText: "A special ability.",
  extraText: null,
  arts: [{ name: "Test Art", damage: "40", cost: ["RED"], effectText: "An art effect." }],
  oshiSkills: [],
  keywords: [],
  qna: [],
  tcgId: 9001,
  pricingData: {
    dailyPrices: [{ date: "2026-08-18T20:05:08+0000", marketPrice: 4.25, lowPrice: 3.99 }]
  }
};

test("selects the exact card-number and rarity price using the newest snapshot", () => {
  const cards = [{
    cardNumber: "hBP01-001",
    rarity: "OUR",
    tcgId: 645576,
    pricingData: {
      dailyPrices: [
        { date: "2026-08-17T20:05:54+0000", marketPrice: 190, lowPrice: 195 },
        { date: "2026-08-18T20:05:08+0000", marketPrice: 200, lowPrice: 199.99 }
      ]
    }
  }];

  assert.deepEqual(selectEnglishPricing(cards, "HBP01-001", "our"), {
    tcgId: 645576,
    updatedAt: "2026-08-18T20:05:08+0000",
    lowPrice: 199.99,
    midPrice: undefined,
    highPrice: undefined,
    marketPrice: 200,
    directLowPrice: undefined
  });
  assert.equal(selectEnglishPricing(cards, "hBP01-001", "OSR"), null);
});

test("maps English API cards into Discord card details", () => {
  const card = mapEnglishCard(englishCard);

  assert.equal(card.edition, "english");
  assert.equal(card.siteId, "en-2001");
  assert.equal(card.imageUrl, englishCard.imageUrl);
  assert.deepEqual(card.setNames, ["Booster Pack – Test Set"]);
  assert.equal(card.metadata["Card type"], "Holomem");
  assert.equal(card.metadata.HP, "100");
  assert.deepEqual(card.sections, [
    { name: "Card text", value: "A special ability." },
    { name: "Art — Test Art", value: "Cost: Red\nDamage: 40\nAn art effect." }
  ]);
  assert.equal(card.englishPricing.marketPrice, 4.25);
});

test("searches English names with lightweight card summaries", async () => {
  const requests = [];
  const client = createOshiCardApiClient({
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return jsonResponse({ data: { cards: { nodes: [englishCard] } } });
    }
  });

  const cards = await client.searchEnglishCardSummaries("English Only");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].cardNumber, "hBP05-001");
  assert.equal(cards[0].name, "English Only Member");
  assert.deepEqual(requests[0].variables, { search: "English Only" });
});

test("resolves an English-only name into full selected-card details", async () => {
  const summary = {
    id: englishCard.id,
    cardNumber: englishCard.cardNumber,
    name: englishCard.name,
    rarity: englishCard.rarity
  };
  const responses = [
    jsonResponse({ data: { cards: { nodes: [summary] } } }),
    jsonResponse({ data: { card: englishCard } }),
    jsonResponse({ data: { cards: { nodes: [summary] } } })
  ];
  const client = createOshiCardApiClient({
    fetchImpl: async () => responses.shift()
  });

  const resolved = await client.resolveEnglishCardQuery("English Only RR");
  assert.equal(resolved.edition, "english");
  assert.equal(resolved.rarity, "RR");
  assert.equal(resolved.cards[0].number, "hBP05-001");
  assert.equal(resolved.cards[0].imageUrl, englishCard.imageUrl);
  assert.deepEqual(resolved.searchResults, [{
    number: "hBP05-001",
    name: "English Only Member",
    rarities: ["RR"]
  }]);
});

test("loads every English rarity for an exact card number", async () => {
  const alternate = { ...englishCard, id: 2002, rarity: "SR", tcgId: 9002 };
  const responses = [
    jsonResponse({ data: { card: englishCard } }),
    jsonResponse({
      data: {
        cards: {
          nodes: [
            { id: englishCard.id, cardNumber: englishCard.cardNumber, name: englishCard.name, rarity: englishCard.rarity },
            { id: alternate.id, cardNumber: alternate.cardNumber, name: alternate.name, rarity: alternate.rarity }
          ]
        }
      }
    }),
    jsonResponse({ data: { card: alternate } })
  ];
  const client = createOshiCardApiClient({
    fetchImpl: async () => responses.shift()
  });

  const cards = await client.findEnglishCardsByNumber("HBP05-001");
  assert.deepEqual(cards.map(card => card.rarity), ["RR", "SR"]);
  assert.ok(cards.every(card => card.edition === "english"));
});

test("resolves a card name, caches its variants, and returns rarity-specific prices", async () => {
  const requests = [];
  const responses = [
    jsonResponse({
      data: {
        card: {
          id: 1,
          name: "Amane Kanata",
          cardNumber: "hBP01-001",
          rarity: "OSR",
          tcgId: 1,
          pricingData: { dailyPrices: [{ date: "2026-08-18T20:05:08+0000", marketPrice: 15.52 }] }
        }
      }
    }),
    jsonResponse({
      data: {
        cards: {
          nodes: [
            {
              id: 1,
              cardNumber: "hBP01-001",
              name: "Amane Kanata",
              rarity: "OSR",
            },
            {
              id: 2,
              cardNumber: "hBP01-001",
              name: "Amane Kanata",
              rarity: "OUR",
            }
          ]
        }
      }
    }),
    jsonResponse({
      data: {
        card: {
          id: 2,
          name: "Amane Kanata",
          cardNumber: "hBP01-001",
          rarity: "OUR",
          tcgId: 2,
          pricingData: { dailyPrices: [{ date: "2026-08-18T20:05:08+0000", marketPrice: 200 }] }
        }
      }
    })
  ];
  const client = createOshiCardApiClient({
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return responses.shift();
    }
  });

  assert.equal((await client.getEnglishCardPricing("hBP01-001", "OSR")).marketPrice, 15.52);
  assert.equal((await client.getEnglishCardPricing("hBP01-001", "OUR")).marketPrice, 200);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[0].variables, { cardNumber: "hBP01-001" });
  assert.deepEqual(requests[1].variables, { name: "Amane Kanata" });
  assert.deepEqual(requests[2].variables, { id: 2 });
});

test("reports upstream HTTP failures without turning them into missing prices", async () => {
  const client = createOshiCardApiClient({
    fetchImpl: async () => jsonResponse({}, 503)
  });

  await assert.rejects(
    client.getEnglishCardPricing("hBP01-001", "OSR"),
    error => error instanceof OshiCardApiError && /HTTP 503/.test(error.message)
  );
});
