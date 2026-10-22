import sharp from "sharp";
import { SPECIAL_RARITIES } from "./packs.js";

const CARD_WIDTH = 250;
const CARD_HEIGHT = 349;
const GAP = 12;
const PADDING = 16;
const COLUMNS = 4;
const HIGHLIGHT = 5;
const BACKGROUND = { r: 30, g: 33, b: 40, alpha: 1 };

function escapeXml(value) {
  return value.replace(/[<>&"']/g, character => `&#${character.charCodeAt(0)};`);
}

function placeholder(card) {
  const svg = `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" rx="12" fill="#3b3f4a"/>
    <text x="50%" y="48%" fill="#e6e6e6" font-family="sans-serif" font-size="22" text-anchor="middle">${escapeXml(card.cardNumber)}</text>
    <text x="50%" y="58%" fill="#b5b9c4" font-family="sans-serif" font-size="20" text-anchor="middle">${escapeXml(card.rarity)}</text>
  </svg>`;
  return Buffer.from(svg);
}

function highlightFrame() {
  const width = CARD_WIDTH + HIGHLIGHT * 2;
  const height = CARD_HEIGHT + HIGHLIGHT * 2;
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" rx="14" fill="#f5b301"/>
  </svg>`);
}

export function packGridLayout(count) {
  const rows = Math.max(1, Math.ceil(count / COLUMNS));
  const columns = Math.min(Math.max(count, 1), COLUMNS);
  return {
    width: PADDING * 2 + columns * CARD_WIDTH + (columns - 1) * GAP,
    height: PADDING * 2 + rows * CARD_HEIGHT + (rows - 1) * GAP,
    positionOf: index => ({
      left: PADDING + (index % COLUMNS) * (CARD_WIDTH + GAP),
      top: PADDING + Math.floor(index / COLUMNS) * (CARD_HEIGHT + GAP)
    })
  };
}

// Cards are drawn in the order given; a card whose image fails gets a labeled placeholder.
export async function buildPackGridImage(cards, loadImage) {
  const layout = packGridLayout(cards.length);
  const tiles = await Promise.all(cards.map(async card => {
    let input;
    try {
      input = await sharp(await loadImage(card))
        .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "contain", background: BACKGROUND })
        .toBuffer();
    } catch (error) {
      console.warn(`Could not draw ${card.cardNumber} in the pack image.`, error);
      input = await sharp(placeholder(card)).png().toBuffer();
    }
    return { card, input };
  }));

  const composites = [];
  tiles.forEach(({ card, input }, index) => {
    const { left, top } = layout.positionOf(index);
    if (SPECIAL_RARITIES.has(card.rarity)) {
      composites.push({ input: highlightFrame(), left: left - HIGHLIGHT, top: top - HIGHLIGHT });
    }
    composites.push({ input, left, top });
  });

  const data = await sharp({
    create: { width: layout.width, height: layout.height, channels: 4, background: BACKGROUND }
  })
    .composite(composites)
    .jpeg({ quality: 85 })
    .toBuffer();
  return { data, name: "pack.jpg" };
}
