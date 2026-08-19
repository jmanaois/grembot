import test from "node:test";
import assert from "node:assert/strict";
import { CardImageError, getCardImageFile } from "../src/card-image.js";

test("rejects card images from non-Japanese-catalogue hosts", async () => {
  await assert.rejects(
    getCardImageFile({ imageUrl: "https://example.com/card.png", siteId: "1", rarity: "UR" }),
    CardImageError
  );
});
