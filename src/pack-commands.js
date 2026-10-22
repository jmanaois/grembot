import { ComponentType, MessageFlags, PermissionFlagsBits } from "discord.js";
import { getCardImageFile } from "./card-image.js";
import { getJapaneseSetCards, listJapaneseBoosterSets } from "./card-site.js";
import {
  BINDER_FILTERS,
  buildBinderPage,
  buildCollectionEmbed,
  buildLeaderboardEmbed,
  buildPackMessage,
  formatCooldown,
  LEADERBOARD_CATEGORIES,
  parseOpenPackButtonId,
  sortBinderCards
} from "./pack-response.js";
import { buildPackGridImage } from "./pack-image.js";
import { bestPull, openPack, pullableCards, sortPackCards, toPackCard } from "./packs.js";

async function setPackCards(code) {
  return (await getJapaneseSetCards(code)).map(toPackCard);
}

async function packImageFile(cards, best) {
  try {
    return await buildPackGridImage(sortPackCards(cards), async card => (await getCardImageFile(card)).data);
  } catch (error) {
    console.warn("Could not draw the pack image; attaching the best pull instead.", error);
  }
  return getCardImageFile(best).catch(error => {
    console.warn(`Could not attach ${best.imageUrl}; using the remote image URL.`, error);
    return null;
  });
}

async function openPackFor(db, interaction, set) {
  const { guildId } = interaction;
  const userId = interaction.user.id;
  const availableAt = db.packAvailableAt(guildId, userId);
  if (availableAt > Date.now()) {
    await interaction.reply({ content: cooldownMessage(availableAt), flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();
  const cards = openPack(await setPackCards(set.code));
  const result = db.savePack({ guildId, userId, setName: set.code, cards });
  if (!result.saved) {
    await interaction.editReply(cooldownMessage(result.availableAt));
    return;
  }

  const best = bestPull(cards);
  const canAttachFiles = interaction.appPermissions?.has(PermissionFlagsBits.AttachFiles) ?? false;
  const imageFile = canAttachFiles ? await packImageFile(cards, best) : null;
  await interaction.editReply(buildPackMessage({
    userName: interaction.member?.displayName ?? interaction.user.displayName,
    set,
    cards,
    best,
    imageFile,
    packsOpened: db.packsOpened(guildId, userId)
  }));
}

function cooldownMessage(availableAt) {
  return `You've already opened a pack recently. Your next pack is ready <t:${Math.ceil(availableAt / 1000)}:R>.`;
}

export function createPackHandlers(db) {
  return {
    async autocomplete(interaction) {
      if (!["openpack", "binder"].includes(interaction.commandName)) return;
      const typed = interaction.options.getFocused().toLowerCase();
      const sets = await listJapaneseBoosterSets().catch(error => {
        console.warn("Could not load booster sets for autocomplete.", error);
        return [];
      });
      await interaction.respond(sets
        .filter(set => [set.name, set.japaneseName].some(name => name.toLowerCase().includes(typed)))
        .slice(0, 25)
        .map(set => ({ name: set.name.slice(0, 100), value: set.code })));
    },

    async openpack(interaction) {
      const requested = interaction.options.getString("set", true).trim().toLowerCase();
      const set = (await listJapaneseBoosterSets()).find(candidate =>
        [candidate.code, candidate.name, candidate.japaneseName].some(name => name.toLowerCase() === requested)
      );
      if (!set) {
        await interaction.reply({
          content: "That isn't a booster set I can open. Pick one from the list as you type.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      await openPackFor(db, interaction, set);
    },

    // The "Open another" button under a pack opens one for whoever clicks it.
    async openpackButton(interaction) {
      const code = parseOpenPackButtonId(interaction.customId);
      const set = code && (await listJapaneseBoosterSets()).find(candidate => candidate.code === code);
      if (!set) {
        await interaction.reply({
          content: "That set can't be opened anymore. Use `/openpack` to pick another.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      await openPackFor(db, interaction, set);
    },

    async collection(interaction) {
      const user = interaction.options.getUser("user") ?? interaction.user;
      const member = interaction.options.getMember("user") ?? (user.id === interaction.user.id ? interaction.member : null);
      await interaction.deferReply();
      const summary = db.collectionSummary(interaction.guildId, user.id);
      const boosterSets = await listJapaneseBoosterSets().catch(error => {
        console.warn("Could not load booster set names.", error);
        return [];
      });
      const sets = await Promise.all(summary.sets.map(async ({ setName, edition, owned }) => {
        if (edition !== "japanese") return { label: `${setName} (English edition)`, owned, size: null };
        const label = boosterSets.find(set => set.code === setName)?.name ?? setName;
        try {
          return { label, owned, size: new Set(pullableCards(await setPackCards(setName)).map(card => card.id)).size };
        } catch (error) {
          console.warn(`Could not load ${setName} to compute completion.`, error);
          return { label, owned, size: null };
        }
      }));
      await interaction.editReply({
        embeds: [buildCollectionEmbed({ userName: member?.displayName ?? user.displayName, summary, sets })]
      });
    },

    async binder(interaction) {
      const user = interaction.options.getUser("user") ?? interaction.user;
      const member = interaction.options.getMember("user") ?? (user.id === interaction.user.id ? interaction.member : null);
      const userName = member?.displayName ?? user.displayName;
      const requested = interaction.options.getString("set")?.trim().toLowerCase();
      const boosterSets = await listJapaneseBoosterSets();
      const setCode = requested ?? db.mostOwnedSet(interaction.guildId, user.id)?.toLowerCase();
      if (!setCode) {
        await interaction.reply({
          content: `${user.id === interaction.user.id ? "You haven't" : `${userName} hasn't`} collected any cards yet. Pick a set to browse, or use \`/openpack\` first!`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const set = boosterSets.find(candidate =>
        [candidate.code, candidate.name, candidate.japaneseName].some(name => name.toLowerCase() === setCode)
      );
      if (!set) {
        await interaction.reply({
          content: "That isn't a booster set. Pick one from the list as you type.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferReply();
      const cards = sortBinderCards([...new Map(
        pullableCards(await setPackCards(set.code)).map(card => [card.id, card])
      ).values()]);
      const owned = db.ownedInSet(interaction.guildId, user.id, set.code);
      let page = 0;
      let filter = "all";
      const render = () => {
        const binder = buildBinderPage({ userName, setName: set.name, cards, owned, page, filter });
        page = binder.page;
        return { embeds: binder.embeds, components: binder.components };
      };

      const message = await interaction.editReply(render());
      const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 10 * 60 * 1000 });
      collector.on("collect", async button => {
        if (button.user.id !== interaction.user.id) {
          await button.reply({ content: "Run `/binder` yourself to flip through a binder.", flags: MessageFlags.Ephemeral });
          return;
        }
        if (button.customId === "binder-prev") page -= 1;
        else if (button.customId === "binder-next") page += 1;
        else if (button.customId === "binder-filter") {
          filter = BINDER_FILTERS[(BINDER_FILTERS.indexOf(filter) + 1) % BINDER_FILTERS.length];
          page = 0;
        }
        await button.update(render()).catch(error => console.error(error));
      });
      collector.on("end", () => interaction.editReply({ components: [] }).catch(() => {}));
    },

    async leaderboard(interaction) {
      const category = interaction.options.getString("category") ?? "unique";
      if (!LEADERBOARD_CATEGORIES[category]) {
        await interaction.reply({ content: "Pick a leaderboard category from the list.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({
        embeds: [buildLeaderboardEmbed({
          guildName: interaction.guild?.name,
          category,
          rows: db.leaderboard(interaction.guildId, category),
          viewerId: interaction.user.id
        })],
        allowedMentions: { parse: [] }
      });
    },

    async packcooldown(interaction) {
      const hours = interaction.options.getNumber("hours");
      if (hours === null) {
        await interaction.reply({
          content: `Packs in this server have ${formatCooldown(db.packCooldownMinutes(interaction.guildId))}.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          content: "You need the Manage Server permission to change the pack cooldown.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const minutes = Math.round(hours * 60);
      db.setPackCooldownMinutes(interaction.guildId, minutes);
      await interaction.reply(minutes === 0
        ? "Pack cooldown turned off. Members can open packs whenever they like."
        : `Members now wait ${formatCooldown(minutes)} between packs.`);
    }
  };
}
