import test from "node:test";
import assert from "node:assert/strict";
import { parseEnglishSearchResults, parseSearchResults } from "../src/card-site.js";

const fixture = `
<ul class="cardlist-Result_List_Txt">
  <li><a href="/cardlist/?id=22&keyword=hBP01-001&view=text">
    <div class="img"><img src="/wp-content/images/cardlist/hBP01/hBP01-001_OSR.png" alt="天音かなた"></div>
    <div class="center-Txtarea">
      <p class="number">hBP01-001</p><p class="name">天音かなた</p>
      <div class="info"><dl>
        <dt>カードタイプ</dt><dd>推しホロメン</dd>
        <dt>レアリティ</dt><dd>OSR</dd>
        <dt>収録商品</dt><dd>ブルーミングレディアンス</dd>
        <dt>色</dt><dd><img src="white.png" alt="白"></dd>
        <dt>LIFE</dt><dd>5</dd>
      </dl></div>
      <div class="oshi skill"><p>推しスキル</p><p>[ホロパワー:-3]<span>ぎゅっぎゅっ</span> 効果。</p></div>
      <div class="txtarea-Btn">MORE</div>
    </div>
  </a></li>
  <li><a href="/cardlist/?id=99"><p class="number">different</p></a></li>
</ul>`;

test("parses only exact Japanese card-number matches", () => {
  const cards = parseSearchResults(fixture, "HBP01-001");
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0], {
    siteId: "22",
    number: "hBP01-001",
    name: "天音かなた",
    imageUrl: "https://hololive-official-cardgame.com/wp-content/images/cardlist/hBP01/hBP01-001_OSR.png",
    detailUrl: "https://hololive-official-cardgame.com/cardlist/?id=22",
    rarity: "OSR",
    metadata: {
      "カードタイプ": "推しホロメン",
      "レアリティ": "OSR",
      "収録商品": "ブルーミングレディアンス",
      "色": "白",
      LIFE: "5"
    },
    sections: [{ name: "推しスキル", value: "[ホロパワー:-3]ぎゅっぎゅっ 効果。" }]
  });
});

test("ranks exact English-name matches and removes duplicate printings", () => {
  const englishFixture = `
    <ul class="cardlist-Result_List_Txt">
      <li><p class="number">hBP02-078</p><p class="name">Kanata Construction</p></li>
      <li><p class="number">hBP01-001</p><p class="name">Amane Kanata</p></li>
      <li><p class="number">hBP01-001</p><p class="name">Amane Kanata</p></li>
      <li><p class="number">hBP01-009</p><p class="name">Amane Kanata</p></li>
      <li><p class="number">hBP01-116</p><p class="name">Upao</p></li>
    </ul>`;

  assert.deepEqual(parseEnglishSearchResults(englishFixture, "Amane Kanata"), [
    { number: "hBP01-001", name: "Amane Kanata" },
    { number: "hBP01-009", name: "Amane Kanata" }
  ]);
});
