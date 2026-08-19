# Grembot

A Discord bot that looks up **Japanese-edition** hololive OFFICIAL CARD GAME cards by card number. It reads the public Japanese card catalogue live, so newly published cards do not require a bot update.

## Command

`/card query:hBP01-001`

`/card query:Amane Kanata`

`/card query:ayame sec`

Add a rarity anywhere in an English name or card-number query to return only that printing, such as `UR shiori`, `ayame SEC`, or `hBP01-001 OSR`.

The bot replies with the official Japanese card image and Japanese card information. English names are resolved through the official English catalogue, but the displayed card always comes from the Japanese catalogue. If a name matches multiple card numbers, or a card has multiple rarities/art variants, the response includes dropdowns for switching between them.

The Japanese catalogue is the source of truth for card numbers, rarities, and images. The English catalogue is used only to resolve an English name to its Japanese name. Regional naming exceptions can be added to `data/name-aliases.json` without changing bot code.

## Setup

1. Install [Node.js 20.12 or newer](https://nodejs.org/).
2. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application and bot.
3. Copy `.env.example` to `.env`, then fill in:
   - `DISCORD_TOKEN`: token from the Bot page.
   - `CLIENT_ID`: application ID from General Information.
   - `GUILD_ID`: optional development server ID. Guild commands update immediately; global commands can take longer to appear.
4. Install and register the command:

   ```powershell
   npm install
   npm run deploy-commands
   ```

5. On **OAuth2 > URL Generator**, select `bot` and `applications.commands`. Grant at least **View Channels**, **Send Messages**, **Embed Links**, and **Use Application Commands**, then use the generated URL to invite the bot.
6. Start it:

   ```powershell
   npm start
   ```

## Notes

- Card data and images come from `https://hololive-official-cardgame.com`; the English catalogue is used only for name resolution when an alias is unavailable.
- Results are cached in memory for 15 minutes to reduce load on the official site.
- Card images are downloaded on demand, cached temporarily in memory, and attached to Discord messages so embeds do not depend on remote image proxying. The official URL is used as a fallback.
- This project is unofficial. Card images and card data belong to their respective rights holders; review COVER's terms before operating a public or commercial bot.

## Test

```powershell
npm test
```
