import test from "node:test";
import assert from "node:assert/strict";
import { CardImageError, getCardImageFile } from "../src/card-image.js";

test("rejects card images from unexpected hosts", async () => {
  await assert.rejects(
    getCardImageFile({ imageUrl: "https://example.com/card.png", siteId: "1", rarity: "UR" }),
    CardImageError
  );
});

test("accepts official English catalogue images", async () => {
  const originalFetch = globalThis.fetch;
  const imageUrl = "https://en.hololive-official-cardgame.com/wp-content/images/test-card.png";
  globalThis.fetch = async () => ({
    ok: true,
    url: imageUrl,
    headers: {
      get(name) {
        if (name.toLowerCase() === "content-type") return "image/png";
        if (name.toLowerCase() === "content-length") return "3";
        return null;
      }
    },
    async arrayBuffer() {
      return Uint8Array.from([1, 2, 3]).buffer;
    }
  });

  try {
    const image = await getCardImageFile({ imageUrl, siteId: "en-1", rarity: "RR" });
    assert.equal(image.name, "card-en-1-rr.png");
    assert.equal(image.data.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
