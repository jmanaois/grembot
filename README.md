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

### Inline lookups

When `INLINE_LOOKUPS=true`, writing `[[card name]]` in any message makes the bot reply with that card, for example `that [[ayame sec]] pull was insane`. Up to three cards per message are shown. This needs the privileged **Message Content Intent**: turn it on under **Bot > Privileged Gateway Intents** in the Developer Portal before you enable the setting, or the bot will fail to log in.

### Card of the day

Set `DAILY_CARD_CHANNEL_ID` to a channel ID to post a card of the day there. `DAILY_CARD_HOUR_UTC` sets the hour it is posted (0–23, default 15). The bot checks the channel's recent messages before posting, so restarting it does not post the same day's card twice.

## Setup

1. Install [Node.js 20.12 or newer](https://nodejs.org/).
2. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application and bot.
3. Copy `.env.example` to `.env`, then fill in:
   - `DISCORD_TOKEN`: token from the Bot page.
   - `CLIENT_ID`: application ID from General Information.
   - `GUILD_ID`: optional development server ID. Guild commands update immediately; global commands can take longer to appear.
   - `INLINE_LOOKUPS`: optional; set to `true` to enable `[[card]]` lookups.
   - `DAILY_CARD_CHANNEL_ID` and `DAILY_CARD_HOUR_UTC`: optional card of the day settings.
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
