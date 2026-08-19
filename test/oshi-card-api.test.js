import test from "node:test";
import assert from "node:assert/strict";
import {
  createOshiCardApiClient,
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

test("resolves a card name, caches its variants, and returns rarity-specific prices", async () => {
  const requests = [];
  const responses = [
    jsonResponse({
      data: {
        card: {
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
              cardNumber: "hBP01-001",
              rarity: "OSR",
              tcgId: 1,
              pricingData: { dailyPrices: [{ date: "2026-08-18T20:05:08+0000", marketPrice: 15.52 }] }
            },
            {
              cardNumber: "hBP01-001",
              rarity: "OUR",
              tcgId: 2,
              pricingData: { dailyPrices: [{ date: "2026-08-18T20:05:08+0000", marketPrice: 200 }] }
            }
          ]
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
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].variables, { cardNumber: "hBP01-001" });
  assert.deepEqual(requests[1].variables, { name: "Amane Kanata" });
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
