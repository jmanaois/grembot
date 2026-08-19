import test from "node:test";
import assert from "node:assert/strict";
import { buildCardMessage, buildSearchResultComponents } from "../src/card-response.js";

const card = {
  siteId: "22",
  number: "hBP01-001",
  name: "天音かなた",
  imageUrl: "https://hololive-official-cardgame.com/wp-content/images/cardlist/hBP01/hBP01-001_OSR.png",
  detailUrl: "https://hololive-official-cardgame.com/cardlist/?id=22",
  rarity: "OSR",
  metadata: { "カードタイプ": "推しホロメン", "レアリティ": "OSR", "収録商品": "テスト商品" },
  sections: [{ name: "推しスキル", value: "効果テキスト" }]
};

test("builds an image embed and only adds a selector for multiple printings", () => {
  const single = buildCardMessage([card]);
  assert.equal(single.embeds[0].data.image.url, card.imageUrl);
  assert.deepEqual(single.embeds[0].data.fields.map(field => field.name), [
    "Card information", "Card set", "推しスキル"
  ]);
  assert.equal(single.components.length, 0);

  const multiple = buildCardMessage([card, { ...card, siteId: "23", rarity: "OUR" }], 1);
  assert.equal(multiple.components.length, 1);
  assert.equal(multiple.components[0].components[0].options.length, 2);
  assert.equal(multiple.components[0].components[0].options[1].data.default, true);
  assert.equal(multiple.components[0].components[0].data.placeholder, "Choose another rarity / artwork");
});

test("can use a Discord attachment instead of a remote image URL", () => {
  const message = buildCardMessage([card], 0, { data: Buffer.from("image"), name: "card-22-osr.png" });
  assert.equal(message.embeds[0].data.image.url, "attachment://card-22-osr.png");
  assert.equal(message.files[0].name, "card-22-osr.png");
  assert.deepEqual(message.attachments, []);
});

test("builds an English-name search-result selector", () => {
  const rows = buildSearchResultComponents([
    { number: "hBP01-001", name: "Amane Kanata", rarities: ["OSR", "OUR"] },
    { number: "hBP01-009", name: "Amane Kanata", rarities: ["C"] }
  ], "hBP01-009", "OUR");
  assert.equal(rows[0].components[0].data.custom_id, "card-result");
  assert.equal(rows[0].components[0].options[1].data.default, true);
  assert.match(rows[0].components[0].options[0].data.label, /\[OUR\]$/);
});
