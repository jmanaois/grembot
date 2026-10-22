import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/database.js";
import { buildCollectionEmbed, buildPackMessage, formatCooldown } from "../src/pack-response.js";
import { bestPull, isBoosterSet, openPack, PACK_RATES, PackError, pullableCards } from "../src/packs.js";

let nextId = 1;
const makeCards = (rarity, count, cardType = "HOLOMEM") => Array.from({ length: count }, () => {
  const id = nextId++;
  return { id, cardNumber: `hBP01-${String(id).padStart(3, "0")}`, name: `Card ${id}`, rarity, cardType };
});
const setCards = [
  ...makeCards("C", 20),
  ...makeCards("U", 10),
  ...makeCards("C", 3, "CHEER"),
  ...makeCards("R", 5),
  ...makeCards("RR", 3),
  ...makeCards("SR", 4),
  ...makeCards("OSR", 2),
  ...makeCards("UR", 2),
  ...makeCards("OUR", 1),
  ...makeCards("SEC", 1),
  ...makeCards("S", 5)
];

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test("only booster sets can be opened", () => {
  assert.equal(isBoosterSet("Booster Pack – Quintet Spectrum"), true);
  assert.equal(isBoosterSet("Extra Booster – Summer hologram"), true);
  assert.equal(isBoosterSet("Start Deck – Oshi Advent"), false);
  assert.equal(isBoosterSet("PROMO CARDS"), false);
});

test("opens 8-card packs with 6 common, 1 rare, and 1 hit slot", () => {
  const pack = openPack(setCards, { random: seededRandom(1) });
  assert.equal(pack.length, 8);
  assert.deepEqual(pack.map(card => card.slot), [...Array(6).fill("Common"), "Rare", "Hit"]);
  assert.ok(pack.slice(0, 6).every(card => ["C", "U"].includes(card.rarity) && card.cardType !== "CHEER"));
  assert.ok(["R", "RR"].includes(pack[6].rarity));
  assert.ok(["SR", "OSR", "SY", "UR", "OUR", "SEC"].includes(pack[7].rarity));
  assert.equal(new Set(pack.map(card => card.id)).size, 8);
  assert.ok(!pack.some(card => card.rarity === "S"));
});

test("makes OUR and SEC the rarest hits and rescales missing rarities", () => {
  const random = seededRandom(42);
  const hits = {};
  for (let index = 0; index < 5_000; index += 1) {
    const rarity = openPack(setCards, { random }).at(-1).rarity;
    hits[rarity] = (hits[rarity] ?? 0) + 1;
  }
  assert.equal(hits.SY, undefined);
  assert.ok(hits.SR > hits.OSR && hits.SR > hits.UR);
  assert.ok(hits.OUR < hits.OSR && hits.OUR < hits.UR);
  assert.ok(hits.SEC < hits.OSR && hits.SEC < hits.UR);
  // SY's weight is spread over the rest, so SEC lands near 4/92 of hits.
  assert.ok(Math.abs(hits.SEC / 5_000 - 4 / 92) < 0.015);
});

test("refuses sets with no pullable cards", () => {
  assert.throws(() => openPack(makeCards("C", 3, "CHEER")), PackError);
});

test("counts only pullable cards toward set completion", () => {
  assert.equal(pullableCards(setCards).length, setCards.length - 3 - 5);
  assert.equal(PACK_RATES.slots.reduce((sum, slot) => sum + slot.count, 0), 8);
});

test("saves packs per server and enforces the server's cooldown", () => {
  const db = openDatabase(":memory:");
  const pack = openPack(setCards, { random: seededRandom(7) });
  const now = Date.parse("2026-10-22T12:00:00Z");

  assert.equal(db.packCooldownMinutes("guild"), 0);
  assert.equal(db.savePack({ guildId: "guild", userId: "user", setName: "Set", cards: pack, now }).saved, true);
  assert.equal(db.savePack({ guildId: "guild", userId: "user", setName: "Set", cards: pack, now }).saved, true);

  db.setPackCooldownMinutes("guild", 90);
  const blocked = db.savePack({ guildId: "guild", userId: "user", setName: "Set", cards: pack, now: now + 60_000 });
  assert.deepEqual(blocked, { saved: false, availableAt: now + 90 * 60_000 });
  assert.equal(db.savePack({ guildId: "guild", userId: "user", setName: "Set", cards: pack, now: now + 91 * 60_000 }).saved, true);
  assert.equal(db.savePack({ guildId: "other", userId: "user", setName: "Set", cards: pack, now }).saved, true);

  const summary = db.collectionSummary("guild", "user");
  assert.equal(summary.packsOpened, 3);
  assert.equal(summary.totalCards, 24);
  assert.equal(summary.uniqueCards, 8);
  assert.deepEqual(summary.sets, [{ setName: "Set", owned: 8 }]);
  assert.equal(db.collectionSummary("other", "user").totalCards, 8);
  assert.equal(db.collectionSummary("guild", "someone else").totalCards, 0);
  db.close();
});

test("shows the pack rarest-last and highlights special pulls", () => {
  const pack = [
    { id: 1, cardNumber: "hBP01-001", name: "Top", rarity: "SEC", imageUrl: "https://example.com/sec.png" },
    { id: 2, cardNumber: "hBP01-002", name: "Filler", rarity: "C" }
  ];
  const embed = buildPackMessage({ userName: "Julian", setName: "Booster Pack – Test", cards: pack, best: bestPull(pack), packsOpened: 3 }).embeds[0].data;
  assert.match(embed.description, /^`C  ` hBP01-002 — Filler\n✨ `SEC` hBP01-001 — Top$/);
  assert.equal(embed.fields[0].name, "✨ SEC pull!");
  assert.equal(embed.image.url, "https://example.com/sec.png");
  assert.match(embed.footer.text, /Pack #3/);
});

test("summarizes collections with set completion", () => {
  const empty = buildCollectionEmbed({
    userName: "Julian",
    summary: { totalCards: 0, sets: [], ownedCards: [] },
    setSizes: new Map()
  });
  assert.match(empty.data.description, /openpack/);

  const embed = buildCollectionEmbed({
    userName: "Julian",
    summary: {
      packsOpened: 1,
      totalCards: 8,
      uniqueCards: 2,
      sets: [{ setName: "Booster Pack – Test", owned: 2 }],
      ownedCards: [
        { cardNumber: "hBP01-002", name: "Filler", rarity: "C", copies: 7 },
        { cardNumber: "hBP01-001", name: "Top", rarity: "OUR", copies: 1 }
      ]
    },
    setSizes: new Map([["Booster Pack – Test", 8]])
  });
  assert.equal(embed.data.fields[0].value, "**Booster Pack – Test:** 2/8 (25.0%)");
  assert.match(embed.data.fields[1].value, /^✨ `OUR` hBP01-001 — Top\n`C  ` hBP01-002 — Filler ×7$/);
});

test("formats cooldowns", () => {
  assert.equal(formatCooldown(0), "no cooldown");
  assert.equal(formatCooldown(60), "1 hour");
  assert.equal(formatCooldown(150), "2 hours 30 minutes");
});
