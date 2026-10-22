import test from "node:test";
import assert from "node:assert/strict";
import {
  dailyCardIndex,
  extractInlineQueries,
  MAX_INLINE_QUERIES,
  shouldPostDailyCard,
  utcDateKey
} from "../src/card-features.js";
import { buildCompareSummary, buildMultiCardMessage, buildPriceEmbed } from "../src/card-response.js";
import { summarizePriceTrend } from "../src/oshi-card-api.js";

const card = {
  siteId: "22",
  number: "hBP01-001",
  name: "Amane Kanata",
  imageUrl: "https://hololive-official-cardgame.com/card.png",
  detailUrl: "https://hololive-official-cardgame.com/cardlist/?id=22",
  rarity: "OSR",
  metadata: {},
  sections: [{ name: "Oshi Skill", value: "x".repeat(1_000) }]
};

test("extracts unique inline [[card]] queries up to the limit", () => {
  assert.deepEqual(extractInlineQueries("look at [[ayame  sec]] and [[AYAME SEC]]"), ["ayame sec"]);
  assert.deepEqual(extractInlineQueries("[[a]] [[]] [x] no queries"), []);
  assert.equal(extractInlineQueries("[[aa]] [[bb]] [[cc]] [[dd]]").length, MAX_INLINE_QUERIES);
  assert.deepEqual(extractInlineQueries("[[line\nbreak]]"), []);
});

test("picks a stable daily card index within range", () => {
  const index = dailyCardIndex("2026-10-22", 1950);
  assert.equal(dailyCardIndex("2026-10-22", 1950), index);
  assert.ok(index >= 0 && index < 1950);
  assert.notEqual(dailyCardIndex("2026-10-23", 1950), index);
  assert.equal(dailyCardIndex("2026-10-22", 0), -1);
});

test("posts the daily card once per UTC day after the configured hour", () => {
  const morning = new Date("2026-10-22T09:00:00Z");
  const afternoon = new Date("2026-10-22T16:00:00Z");
  assert.equal(utcDateKey(afternoon), "2026-10-22");
  assert.equal(shouldPostDailyCard(morning, 15, null), false);
  assert.equal(shouldPostDailyCard(afternoon, 15, null), true);
  assert.equal(shouldPostDailyCard(afternoon, 15, "2026-10-22"), false);
  assert.equal(shouldPostDailyCard(afternoon, 15, "2026-10-21"), true);
});

test("summarizes market price changes over a window", () => {
  const prices = [
    { date: "2026-10-01T20:00:00+0000", marketPrice: 12 },
    { date: "2026-09-24T20:00:00+0000", marketPrice: 10 },
    { date: "2026-09-30T20:00:00+0000", marketPrice: 11 }
  ];
  assert.deepEqual(summarizePriceTrend(prices, 7), { days: 7, from: 10, to: 12, change: 2, percent: 20 });
  assert.equal(summarizePriceTrend(prices, 30), null);
  assert.equal(summarizePriceTrend([], 7), null);
});

test("lists printings by price with trends", () => {
  const embed = buildPriceEmbed([
    { ...card, rarity: "OSR", englishPricing: { marketPrice: 16, updatedAt: "2026-10-01T20:00:00+0000" }, englishPriceTrends: [{ days: 7, change: -1, percent: -5.9 }] },
    { ...card, rarity: "OUR", englishPricing: { lowPrice: 190, updatedAt: "2026-10-01T20:00:00+0000" } },
    { ...card, rarity: "SEC", englishPricing: null }
  ]);
  assert.deepEqual(embed.data.fields.map(field => field.name), ["OUR", "OSR"]);
  assert.match(embed.data.fields[1].value, /▼ −\$1\.00 \(−5\.9%\) 7d/);
  assert.match(buildPriceEmbed([{ ...card, englishPricing: null }]).data.description, /No English printing/);
});

test("fits several cards into one message within Discord's embed limit", () => {
  const entries = [
    { card, imageFile: { data: Buffer.from("a"), name: "card-22-osr.png" } },
    { card: { ...card, siteId: "23", name: "Nakiri Ayame" }, imageFile: { data: Buffer.from("b"), name: "card-23-osr.png" } },
    { card: { ...card, siteId: "24" } }
  ];
  const message = buildMultiCardMessage(entries, buildCompareSummary(entries.slice(0, 2)));
  assert.equal(message.embeds.length, 3);
  assert.equal(message.files.length, 2);
  assert.equal(message.embeds[0].data.image.url, "attachment://card-22-osr.png");
  assert.match(message.content, /Amane Kanata.*\n\*\*vs\*\*\n.*Nakiri Ayame/);
  const totalLength = message.embeds.reduce((sum, embed) => sum + JSON.stringify(embed.data.fields ?? []).length, 0);
  assert.ok(totalLength < 6_000);
});
