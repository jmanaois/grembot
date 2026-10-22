const INLINE_QUERY_PATTERN = /\[\[([^[\]\n]{2,100})\]\]/g;
export const MAX_INLINE_QUERIES = 3;

export function extractInlineQueries(content) {
  const queries = [];
  for (const match of content.matchAll(INLINE_QUERY_PATTERN)) {
    const query = match[1].trim().replace(/\s+/g, " ");
    if (query.length < 2) continue;
    if (queries.some(existing => existing.toLowerCase() === query.toLowerCase())) continue;
    queries.push(query);
    if (queries.length === MAX_INLINE_QUERIES) break;
  }
  return queries;
}

export function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function dailyCardIndex(dateKey, total) {
  if (total <= 0) return -1;
  // FNV-1a keeps the pick stable for a given day across restarts.
  let hash = 0x811c9dc5;
  for (const character of `grembot-daily-${dateKey}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % total;
}

export function shouldPostDailyCard(now, postHourUtc, lastPostedKey) {
  return now.getUTCHours() >= postHourUtc && lastPostedKey !== utcDateKey(now);
}
