import test from "node:test";
import assert from "node:assert/strict";
import { buildPackRatesEmbed } from "../src/pack-response.js";
import { countPullableByRarity, packOdds, slotWeights } from "../src/packs.js";

const hitSlot = { name: "Hit", count: 1, rarities: { SR: 60, OSR: 12, SY: 8, UR: 12, OUR: 4, SEC: 4 } };
const rates = {
  slots: [
    { name: "Common", count: 6, rarities: { C: 3, U: 1 } },
    { name: "Rare", count: 1, rarities: { R: 3, RR: 1 } },
    hitSlot
  ]
};

test("gives a missing rarity's weight to the most common rarity left in the slot", () => {
  assert.deepEqual(slotWeights(hitSlot), Object.entries(hitSlot.rarities));
  const withoutSrOrSy = slotWeights(hitSlot, rarity => !["SR", "SY"].includes(rarity));
  assert.deepEqual(withoutSrOrSy, [["OSR", 80], ["UR", 12], ["OUR", 4], ["SEC", 4]]);
  assert.deepEqual(slotWeights(hitSlot, () => false), []);
});

test("computes per-slot, per-pack, and per-card odds", () => {
  const [common, rare, hit] = packOdds({ rates });
  assert.deepEqual(common.rarities.map(odds => odds.rarity), ["C", "U"]);
  assert.equal(common.rarities[1].chance, 0.25);
  assert.ok(Math.abs(common.rarities[1].perPack - (1 - 0.75 ** 6)) < 1e-12);
  assert.equal(rare.rarities[1].perPack, 0.25);
  assert.deepEqual(hit.rarities.map(odds => odds.rarity), ["SR", "SY", "OSR", "UR", "OUR", "SEC"]);
  assert.equal(hit.rarities.at(-1).cards, null);

  const cardCounts = new Map([["C", 10], ["U", 5], ["R", 4], ["RR", 2], ["OSR", 4], ["UR", 3], ["OUR", 2], ["SEC", 2]]);
  const setHit = packOdds({ rates, cardCounts })[2];
  assert.deepEqual(setHit.rarities.map(odds => [odds.rarity, odds.chance]), [["OSR", 0.8], ["UR", 0.12], ["OUR", 0.04], ["SEC", 0.04]]);
  const sec = setHit.rarities.at(-1);
  assert.equal(sec.cards, 2);
  assert.ok(Math.abs(sec.perCardPerPack - 0.02) < 1e-12);
});

test("counts only pullable cards per rarity", () => {
  const counts = countPullableByRarity([
    { id: 1, rarity: "C", cardType: "ホロメン" },
    { id: 2, rarity: "C", cardType: "CHEER" },
    { id: 3, rarity: "sec", cardType: "ホロメン" },
    { id: 4, rarity: "S", cardType: "ホロメン" }
  ], rates);
  assert.deepEqual([...counts], [["C", 1], ["SEC", 1]]);
});

test("shows rarity order and readable odds", () => {
  const general = buildPackRatesEmbed({ odds: packOdds({ rates }) }).toJSON();
  assert.equal(general.title, "Pack rates");
  assert.match(general.description, /\*\*8 cards per pack\.\*\*/);
  assert.match(general.description, /`C` < `U` < `R` < `RR` < `SR` < `SY` < `OSR` < `UR` < `OUR` < `SEC`/);
  assert.deepEqual(general.fields.map(field => field.name), ["Common slots ×6", "Rare slot", "Hit slot"]);
  assert.equal(general.fields[0].value.split("\n")[1], "`U  ` 25.0% per card • in 82.2% of packs");
  assert.equal(general.fields[1].value.split("\n")[0], "`R  ` 75.0%");
  assert.equal(general.fields[2].value.split("\n").at(-1), "✨ `SEC` 4.0% • 1 in 25 packs");

  const cardCounts = new Map([["C", 10], ["U", 5], ["R", 4], ["RR", 2], ["SR", 20], ["OSR", 4], ["UR", 3], ["OUR", 2], ["SEC", 2]]);
  const forSet = buildPackRatesEmbed({ set: { name: "Bouncer Bound (hBP08)" }, odds: packOdds({ rates, cardCounts }) }).toJSON();
  assert.equal(forSet.title, "Pack rates — Bouncer Bound (hBP08)");
  assert.equal(forSet.fields[2].value.split("\n").at(-1), "✨ `SEC` 4.0% • 1 in 25 packs • 2 cards, a specific one 1 in 50 packs");
});
