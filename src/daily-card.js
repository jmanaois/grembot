import { PermissionFlagsBits } from "discord.js";
import { buildMultiCardMessage } from "./card-response.js";
import { shouldPostDailyCard, utcDateKey } from "./card-features.js";
import { getDailyCardSummary, loadCardExtras, lookupCardsForSummary } from "./card-lookup.js";

const CHECK_INTERVAL_MS = 60 * 1000;
export const DAILY_CARD_LABEL = "Card of the day";

export async function buildDailyCardMessage(dateKey, { canAttachFiles }) {
  const summary = await getDailyCardSummary(dateKey);
  if (!summary) return null;
  const { cards } = await lookupCardsForSummary(summary);
  if (cards.length === 0) return null;
  const card = cards[0];
  const message = buildMultiCardMessage([{ card, ...await loadCardExtras(card, { canAttachFiles }) }]);
  message.embeds[0].setAuthor({ name: `${DAILY_CARD_LABEL} • ${dateKey}` });
  return message;
}

async function alreadyPosted(channel, botUserId, dateKey) {
  const recent = await channel.messages.fetch({ limit: 20 });
  return recent.some(message =>
    message.author.id === botUserId
    && message.embeds[0]?.author?.name === `${DAILY_CARD_LABEL} • ${dateKey}`
  );
}

export function startDailyCardSchedule(client, { channelId, postHourUtc }) {
  let lastPostedKey = null;
  let running = false;

  const tick = async () => {
    const now = new Date();
    if (running || !shouldPostDailyCard(now, postHourUtc, lastPostedKey)) return;
    running = true;
    const dateKey = utcDateKey(now);
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased()) throw new Error(`Channel ${channelId} is not a text channel.`);
      if (await alreadyPosted(channel, client.user.id, dateKey)) {
        lastPostedKey = dateKey;
        return;
      }
      const canAttachFiles = channel.permissionsFor?.(client.user)?.has(PermissionFlagsBits.AttachFiles) ?? false;
      const message = await buildDailyCardMessage(dateKey, { canAttachFiles });
      if (!message) throw new Error("No card was available for today.");
      await channel.send(message);
      lastPostedKey = dateKey;
      console.log(`Posted the card of the day for ${dateKey}.`);
    } catch (error) {
      console.error("Could not post the card of the day; retrying next minute.", error);
    } finally {
      running = false;
    }
  };

  tick();
  return setInterval(tick, CHECK_INTERVAL_MS);
}
