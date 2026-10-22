import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    pack_cooldown_minutes INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS pack_opens (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    last_opened_at INTEGER NOT NULL,
    packs_opened INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS pulls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    card_id INTEGER NOT NULL,
    edition TEXT NOT NULL DEFAULT 'japanese',
    card_number TEXT NOT NULL,
    name TEXT NOT NULL,
    rarity TEXT NOT NULL,
    set_name TEXT NOT NULL,
    image_url TEXT,
    pulled_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS pulls_by_owner ON pulls (guild_id, user_id, set_name);
`;

export function openDatabase(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  // Packs were first pulled from English sets; keep those rows apart from Japanese card IDs.
  if (!db.prepare("PRAGMA table_info(pulls)").all().some(column => column.name === "edition")) {
    db.exec("ALTER TABLE pulls ADD COLUMN edition TEXT NOT NULL DEFAULT 'english'");
  }

  const statements = {
    getCooldown: db.prepare("SELECT pack_cooldown_minutes AS minutes FROM guild_settings WHERE guild_id = ?"),
    setCooldown: db.prepare(`
      INSERT INTO guild_settings (guild_id, pack_cooldown_minutes) VALUES (?, ?)
      ON CONFLICT (guild_id) DO UPDATE SET pack_cooldown_minutes = excluded.pack_cooldown_minutes
    `),
    getLastOpen: db.prepare("SELECT last_opened_at AS lastOpenedAt FROM pack_opens WHERE guild_id = ? AND user_id = ?"),
    recordOpen: db.prepare(`
      INSERT INTO pack_opens (guild_id, user_id, last_opened_at, packs_opened) VALUES (?, ?, ?, 1)
      ON CONFLICT (guild_id, user_id) DO UPDATE SET
        last_opened_at = excluded.last_opened_at,
        packs_opened = packs_opened + 1
    `),
    insertPull: db.prepare(`
      INSERT INTO pulls (guild_id, user_id, card_id, edition, card_number, name, rarity, set_name, image_url, pulled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    packsOpened: db.prepare("SELECT packs_opened AS packsOpened FROM pack_opens WHERE guild_id = ? AND user_id = ?"),
    totals: db.prepare(`
      SELECT COUNT(*) AS total, COUNT(DISTINCT edition || ':' || card_id) AS unique_cards
      FROM pulls WHERE guild_id = ? AND user_id = ?
    `),
    setCounts: db.prepare(`
      SELECT set_name AS setName, edition, COUNT(DISTINCT card_id) AS owned
      FROM pulls WHERE guild_id = ? AND user_id = ?
      GROUP BY edition, set_name ORDER BY edition DESC, set_name
    `),
    ownedCards: db.prepare(`
      SELECT card_id AS cardId, edition, card_number AS cardNumber, name, rarity, COUNT(*) AS copies
      FROM pulls WHERE guild_id = ? AND user_id = ?
      GROUP BY edition, card_id
    `),
    ownedInSet: db.prepare(`
      SELECT card_id AS cardId, COUNT(*) AS copies
      FROM pulls WHERE guild_id = ? AND user_id = ? AND set_name = ? AND edition = 'japanese'
      GROUP BY card_id
    `),
    mostOwnedSet: db.prepare(`
      SELECT set_name AS setName FROM pulls
      WHERE guild_id = ? AND user_id = ? AND edition = 'japanese'
      GROUP BY set_name ORDER BY COUNT(DISTINCT card_id) DESC, MAX(pulled_at) DESC LIMIT 1
    `),
    leaderboardUnique: db.prepare(`
      SELECT user_id AS userId, COUNT(DISTINCT edition || ':' || card_id) AS score
      FROM pulls WHERE guild_id = ? GROUP BY user_id
    `),
    leaderboardPacks: db.prepare(`
      SELECT user_id AS userId, packs_opened AS score FROM pack_opens WHERE guild_id = ? AND packs_opened > 0
    `),
    leaderboardSpecial: db.prepare(`
      SELECT user_id AS userId, COUNT(*) AS score
      FROM pulls WHERE guild_id = ? AND rarity IN ('UR', 'HR', 'OUR', 'SEC') GROUP BY user_id
    `)
  };
  const leaderboardStatements = {
    unique: statements.leaderboardUnique,
    packs: statements.leaderboardPacks,
    special: statements.leaderboardSpecial
  };

  function packCooldownMinutes(guildId) {
    return statements.getCooldown.get(guildId)?.minutes ?? 0;
  }

  function packAvailableAt(guildId, userId) {
    const cooldownMinutes = packCooldownMinutes(guildId);
    if (cooldownMinutes === 0) return 0;
    const lastOpenedAt = statements.getLastOpen.get(guildId, userId)?.lastOpenedAt;
    return lastOpenedAt == null ? 0 : lastOpenedAt + cooldownMinutes * 60 * 1000;
  }

  return {
    close: () => db.close(),
    packCooldownMinutes,
    packAvailableAt,
    packsOpened: (guildId, userId) => statements.packsOpened.get(guildId, userId)?.packsOpened ?? 0,

    setPackCooldownMinutes(guildId, minutes) {
      statements.setCooldown.run(guildId, minutes);
    },

    // Checks the cooldown and saves the pack in one transaction so double-clicks cannot skip it.
    savePack({ guildId, userId, setName, cards, edition = "japanese", now = Date.now() }) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const availableAt = packAvailableAt(guildId, userId);
        if (availableAt > now) {
          db.exec("ROLLBACK");
          return { saved: false, availableAt };
        }
        statements.recordOpen.run(guildId, userId, now);
        for (const card of cards) {
          statements.insertPull.run(
            guildId, userId, card.id, edition, card.cardNumber, card.name, card.rarity, setName, card.imageUrl ?? null, now
          );
        }
        db.exec("COMMIT");
        return { saved: true, availableAt: 0 };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    ownedInSet(guildId, userId, setName) {
      return new Map(statements.ownedInSet.all(guildId, userId, setName).map(row => [row.cardId, row.copies]));
    },

    mostOwnedSet(guildId, userId) {
      return statements.mostOwnedSet.get(guildId, userId)?.setName ?? null;
    },

    // Ranked best first; ties share a rank and are ordered by user ID so the list is stable.
    leaderboard(guildId, category) {
      const statement = leaderboardStatements[category];
      if (!statement) throw new Error(`Unknown leaderboard category: ${category}`);
      const rows = statement.all(guildId)
        .map(row => ({ userId: row.userId, score: row.score }))
        .sort((left, right) => right.score - left.score || left.userId.localeCompare(right.userId));
      let rank = 0;
      return rows.map((row, index) => {
        if (index === 0 || row.score !== rows[index - 1].score) rank = index + 1;
        return { ...row, rank };
      });
    },

    collectionSummary(guildId, userId) {
      const totals = statements.totals.get(guildId, userId);
      return {
        packsOpened: statements.packsOpened.get(guildId, userId)?.packsOpened ?? 0,
        totalCards: totals.total,
        uniqueCards: totals.unique_cards,
        sets: statements.setCounts.all(guildId, userId).map(row => ({ ...row })),
        ownedCards: statements.ownedCards.all(guildId, userId).map(row => ({ ...row }))
      };
    }
  };
}
