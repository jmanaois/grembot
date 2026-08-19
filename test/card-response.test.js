import test from "node:test";
import assert from "node:assert/strict";
import { buildCardMessage } from "../src/card-response.js";

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
  assert.equal(single.components.length, 0);

  const multiple = buildCardMessage([card, { ...card, siteId: "23", rarity: "OUR" }], 1);
  assert.equal(multiple.components.length, 1);
  assert.equal(multiple.components[0].components[0].options.length, 2);
  assert.equal(multiple.components[0].components[0].options[1].data.default, true);
});
