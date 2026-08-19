import { SITE_ORIGIN } from "./card-site.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CONTENT_TYPE_EXTENSIONS = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"]
]);
const imageCache = new Map();
let cachedBytes = 0;

export class CardImageError extends Error {}

function getCachedImage(url) {
  const cached = imageCache.get(url);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    imageCache.delete(url);
    cachedBytes -= cached.data.length;
    return null;
  }
  imageCache.delete(url);
  imageCache.set(url, cached);
  return cached;
}

function cacheImage(url, image) {
  imageCache.set(url, image);
  cachedBytes += image.data.length;
  while (cachedBytes > MAX_CACHE_BYTES && imageCache.size > 1) {
    const oldestKey = imageCache.keys().next().value;
    const oldest = imageCache.get(oldestKey);
    imageCache.delete(oldestKey);
    cachedBytes -= oldest.data.length;
  }
}

async function downloadImage(url) {
  const expectedHost = new URL(SITE_ORIGIN).hostname;
  const parsedUrl = new URL(url);
  if (parsedUrl.hostname !== expectedHost) throw new CardImageError("Refused an image from an unexpected host.");

  const response = await fetch(parsedUrl, {
    headers: {
      Accept: "image/png,image/jpeg,image/webp,image/gif",
      "User-Agent": "grembot/1.0 (Discord card image attachment)"
    },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new CardImageError(`The card image returned HTTP ${response.status}.`);
  if (new URL(response.url).hostname !== expectedHost) {
    throw new CardImageError("The card image redirected to an unexpected host.");
  }

  const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase();
  const extension = CONTENT_TYPE_EXTENSIONS.get(contentType);
  if (!extension) throw new CardImageError(`Unsupported card image type: ${contentType ?? "unknown"}.`);

  const declaredSize = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
  if (declaredSize > MAX_IMAGE_BYTES) throw new CardImageError("The card image is too large to attach to Discord.");
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length === 0 || data.length > MAX_IMAGE_BYTES) {
    throw new CardImageError("The downloaded card image has an invalid size.");
  }
  return { data, extension, expiresAt: Date.now() + CACHE_TTL_MS };
}

export async function getCardImageFile(card) {
  let image = getCachedImage(card.imageUrl);
  if (!image) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        image = await downloadImage(card.imageUrl);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!image) throw lastError;
    cacheImage(card.imageUrl, image);
  }

  const safeRarity = card.rarity.replace(/[^A-Za-z0-9-]/g, "").toLowerCase() || "card";
  return {
    data: image.data,
    name: `card-${card.siteId}-${safeRarity}.${image.extension}`
  };
}
