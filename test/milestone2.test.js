import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { openDatabase } from "../src/database.js";
import { buildPackGridImage, packGridLayout } from "../src/pack-image.js";
import {
  BINDER_PAGE_SIZE,
  buildBinderPage,
  buildLeaderboardEmbed,
  sortBinderCards
} from "../src/pack-response.js";

const card = (id, rarity = "C", cardNumber = `hBP08-${String(id).padStart(3, "0")}`) =>
  ({ id, cardNumber, name: `Card ${id}`, rarity, imageUrl: `https://hololive-official-cardgame.com/${id}.png` });

test("lays packs out four cards per row", () => {
  assert.deepEqual(
    (({ width, height }) => ({ width, height }))(packGridLayout(8)),
    { width: 16 * 2 + 4 * 250 + 3 * 12, height: 16 * 2 + 2 * 349 + 12 }
  );
  assert.deepEqual(packGridLayout(8).positionOf(5), { left: 16 + 262, top: 16 + 361 });
  assert.equal(packGridLayout(2).width, 16 * 2 + 2 * 250 + 12);
});

test("draws a pack grid and uses placeholders for images that fail", async () => {
  const red = await sharp({ create: { width: 400, height: 559, channels: 3, background: "#c00" } }).png().toBuffer();
  const cards = [card(1), card(2), card(3, "SEC")];
  const image = await buildPackGridImage(cards, async item => {
    if (item.id === 2) throw new Error("missing");
    return red;
  });
  assert.equal(image.name, "pack.jpg");
  const metadata = await sharp(image.data).metadata();
  assert.deepEqual([metadata.format, metadata.width, metadata.height], ["jpeg", packGridLayout(3).width, packGridLayout(3).height]);
});

test("pages through a binder and filters owned or missing cards", () => {
  const cards = sortBinderCards(Array.from({ length: 45 }, (_, index) => card(45 - index)));
  assert.equal(cards[0].cardNumber, "hBP08-001");
  const owned = new Map([[1, 2], [3, 1], [44, 1]]);

  const first = buildBinderPage({ userName: "Julian", setName: "Bouncer Bound (hBP08)", cards, owned });
  const description = first.embeds[0].data.description;
  assert.match(description, /^\*\*3\/45\*\* collected \(6\.7%\)/);
  assert.match(description, /✅ `C  ` hBP08-001 — Card 1 ×2/);
  assert.match(description, /▫️ `C  ` hBP08-002 — Card 2/);
  assert.equal(description.split("\n").length, 2 + BINDER_PAGE_SIZE);
  assert.equal(first.pageCount, 3);
  const buttons = first.components[0].components;
  assert.equal(buttons[0].data.disabled, true);
  assert.equal(buttons[1].data.disabled, false);
  assert.equal(buttons[2].data.label, "Show owned");

  const last = buildBinderPage({ userName: "Julian", setName: "Set", cards, owned, page: 99 });
  assert.equal(last.page, 2);
  assert.equal(last.components[0].components[1].data.disabled, true);

  const ownedOnly = buildBinderPage({ userName: "Julian", setName: "Set", cards, owned, filter: "owned" });
  assert.equal(ownedOnly.embeds[0].data.description.split("\n").filter(line => line.startsWith("✅")).length, 3);
  assert.equal(ownedOnly.components[0].components[2].data.label, "Show missing");

  const complete = buildBinderPage({ userName: "Julian", setName: "Set", cards: [card(1)], owned: new Map([[1, 1]]), filter: "missing" });
  assert.match(complete.embeds[0].data.description, /Set complete/);
});

test("ranks leaderboards with shared ranks for ties", () => {
  const db = openDatabase(":memory:");
  const save = (userId, cards, now) => db.savePack({ guildId: "guild", userId, setName: "hBP08", cards, now });
  save("alice", [card(1), card(2, "SEC"), card(3, "UR")], 1);
  save("bob", [card(1), card(2, "SEC")], 2);
  save("bob", [card(4)], 3);
  save("carol", [card(5), card(6)], 4);
  db.savePack({ guildId: "other", userId: "dave", setName: "hBP08", cards: [card(9), card(10), card(11), card(12)], now: 5 });

  assert.deepEqual(db.leaderboard("guild", "unique"), [
    { userId: "alice", score: 3, rank: 1 },
    { userId: "bob", score: 3, rank: 1 },
    { userId: "carol", score: 2, rank: 3 }
  ]);
  assert.deepEqual(db.leaderboard("guild", "packs").map(row => [row.userId, row.score, row.rank]), [
    ["bob", 2, 1], ["alice", 1, 2], ["carol", 1, 2]
  ]);
  assert.deepEqual(db.leaderboard("guild", "special").map(row => [row.userId, row.score]), [["alice", 2], ["bob", 1]]);
  assert.throws(() => db.leaderboard("guild", "nope"));

  assert.deepEqual([...db.ownedInSet("guild", "bob", "hBP08")], [[1, 1], [2, 1], [4, 1]]);
  assert.equal(db.mostOwnedSet("guild", "bob"), "hBP08");
  assert.equal(db.mostOwnedSet("guild", "nobody"), null);
  db.close();
});

test("shows the top ten and the viewer's own rank", () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({ userId: `u${index}`, score: 12 - index, rank: index + 1 }));
  const embed = buildLeaderboardEmbed({ guildName: "Holo", category: "special", rows, viewerId: "u11" });
  const lines = embed.data.description.split("\n");
  assert.equal(embed.data.title, "Most UR/OUR/SEC pulls in Holo");
  assert.equal(lines[0], "🥇 <@u0> — 12 special pulls");
  assert.equal(lines[9], "**10.** <@u9> — 3 special pulls");
  assert.deepEqual(lines.slice(10), ["…", "**12.** <@u11> — 1 special pull"]);
  assert.match(buildLeaderboardEmbed({ category: "unique", rows: [], viewerId: "x" }).data.description, /Nobody/);
});
