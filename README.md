# Grembot

A Discord bot that looks up hololive OFFICIAL CARD GAME cards by card number or English name. Japanese editions come from the public official catalogue; cards that are only available in English fall back to the Oshi Card API.

## Commands

`/card query:hBP01-001`

`/card query:Amane Kanata`

`/card query:ayame sec`

Add a rarity anywhere in an English name or card-number query to return only that printing, such as `UR shiori`, `ayame SEC`, or `hBP01-001 OSR`.

The bot prefers the official Japanese card image and Japanese card information. English names are resolved through the official English catalogue. If no Japanese version matches, the bot displays the English-edition image and English rules data from the [Oshi Card API](https://github.com/LarveyOfficial/oshicardapi). When available, responses also show USD market and low-listing prices for the matching English printing. If a name matches multiple card numbers, or a card has multiple rarities/art variants, the response includes dropdowns for switching between them.

The Japanese catalogue remains the preferred source of truth. The English catalogue and Oshi Card API provide name resolution, English-only card details, images, and market prices. Regional naming exceptions can be added to `data/name-aliases.json` without changing bot code.

### More commands

- `/randomcard rarity:SEC color:Red` pulls a random card. Both filters are optional.
- `/dailycard` shows today's card of the day. Everyone sees the same card for each UTC date.
- `/compare first:kanata second:ayame sec` shows two cards side by side, with their English market prices.
- `/price query:hBP01-001` lists every English printing of a card from most to least expensive, with 7- and 30-day market price changes when there is enough history.

### Packs and collections

- `/openpack set:` opens an 8-card booster pack and saves the cards to your collection. Start typing to pick a set (English or Japanese set names both work). Packs come from the Japanese catalogue, so every Japanese booster and extra booster is available, including sets not yet released in English. Each opened pack has an **Open another** button; whoever clicks it opens a pack from the same set for themselves, subject to the server's cooldown. The button keeps working after the bot restarts.
- `/packrates set:` shows the rarity order and the odds for each pack slot, including how often each rarity turns up per pack. With a set, it also shows how many cards of each rarity the set has and the odds of pulling one specific card.
- `/collection user:` shows packs opened, unique cards, completion for each set, and the rarest cards pulled.
- `/binder set: user:` flips through every card in a set, 20 per page, marking which ones have been collected and how many copies. Buttons switch pages and toggle between all, owned, and missing cards. Without a set, it opens the set with the most cards collected.
- `/leaderboard category:` ranks the server by unique cards, packs opened, or UR/OUR/SEC pulls, and shows your own rank if you're outside the top ten.
- `/packcooldown hours:` lets members with **Manage Server** set how long people wait between packs (0 turns it off, the default). Run it without `hours` to see the current setting.

Opened packs are shown as a single image of all eight cards, rarest last, with special pulls framed in gold (this uses [sharp](https://sharp.pixelplumbing.com/)). If the image can't be drawn, the best pull's card image is shown instead.

Collections are kept separately for each server. Each pack has 6 common slots (C or U), 1 rare slot (R or RR), and 1 hit slot (SR, OSR, SY, UR, OUR, or SEC, with OUR and SEC the least likely). Cheer cards and S/HR printings are not pulled. English set names come from `data/booster-sets.json`; a new set without an entry there still appears under its Japanese name until one is added. Each set's card list is loaded from the official site the first time it is opened and cached for six hours. The odds live in `data/pack-rates.json` as relative weights per slot; when a set has no cards of a rarity, its odds go to the most common rarity left in that slot, so rare pulls keep their intended odds in every set. They are approximations, not official pull rates.

Packs opened before the switch to Japanese sets are kept and listed as English-edition sets in `/collection`. Collections are stored in a SQLite database at `data/grembot.db`. Set `DATABASE_PATH` to keep it somewhere else, and back that file up if the collections matter to your server.

### Inline lookups

When `INLINE_LOOKUPS=true`, writing `[[card name]]` in any message makes the bot reply with that card, for example `that [[ayame sec]] pull was insane`. Up to three cards per message are shown. This needs the privileged **Message Content Intent**: turn it on under **Bot > Privileged Gateway Intents** in the Developer Portal before you enable the setting, or the bot will fail to log in.

### Card of the day

Set `DAILY_CARD_CHANNEL_ID` to a channel ID to post a card of the day there. `DAILY_CARD_HOUR_UTC` sets the hour it is posted (0–23, default 15). The bot checks the channel's recent messages before posting, so restarting it does not post the same day's card twice.

## Setup

1. Install [Node.js 22.13 or newer](https://nodejs.org/).
2. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application and bot.
3. Copy `.env.example` to `.env`, then fill in:
   - `DISCORD_TOKEN`: token from the Bot page.
   - `CLIENT_ID`: application ID from General Information.
   - `GUILD_ID`: optional development server ID. Guild commands update immediately; global commands can take longer to appear.
   - `INLINE_LOOKUPS`: optional; set to `true` to enable `[[card]]` lookups.
   - `DAILY_CARD_CHANNEL_ID` and `DAILY_CARD_HOUR_UTC`: optional card of the day settings.
   - `DATABASE_PATH`: optional location for the collections database.
4. Install and register the commands:

   ```powershell
   npm install
   npm run deploy-commands
   ```

5. On **OAuth2 > URL Generator**, select `bot` and `applications.commands`. Grant at least **View Channels**, **Send Messages**, **Read Message History** (for the card of the day), **Embed Links**, **Attach Files**, and **Use Application Commands**, then use the generated URL to invite the bot.
6. Start it:

   ```powershell
   npm start
   ```

## Notes

- Card data and images come from `https://hololive-official-cardgame.com`; the English catalogue is used only for name resolution when an alias is unavailable.
- Results are cached in memory for 15 minutes to reduce load on the official site.
- English-printing prices come from TCGPlayer-derived data exposed by the Oshi Card API and are cached for one hour. Price lookup failures do not prevent the Japanese card from being displayed.
- Card images are downloaded on demand, cached temporarily in memory, and attached to Discord messages so embeds do not depend on remote image proxying. The official URL is used as a fallback.
- This project is unofficial. Card images and card data belong to their respective rights holders; review COVER's terms before operating a public or commercial bot.

## Test

```powershell
npm test
```
