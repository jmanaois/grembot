import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { getCardImageFile } from "./card-image.js";
import { getJapaneseSetCards, listJapaneseBoosterSets } from "./card-site.js";
import { buildCollectionEmbed, buildPackMessage, formatCooldown } from "./pack-response.js";
import { bestPull, openPack, pullableCards, toPackCard } from "./packs.js";

async function setPackCards(code) {
  return (await getJapaneseSetCards(code)).map(toPackCard);
}

function cooldownMessage(availableAt) {
  return `You've already opened a pack recently. Your next pack is ready <t:${Math.ceil(availableAt / 1000)}:R>.`;
}

export function createPackHandlers(db) {
  return {
    async autocomplete(interaction) {
      if (interaction.commandName !== "openpack") return;
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
      const imageFile = canAttachFiles && best.imageUrl
        ? await getCardImageFile(best)
          .catch(error => {
            console.warn(`Could not attach ${best.imageUrl}; using the remote image URL.`, error);
            return null;
          })
        : null;
      await interaction.editReply(buildPackMessage({
        userName: interaction.member?.displayName ?? interaction.user.displayName,
        setName: set.name,
        cards,
        best,
        imageFile,
        packsOpened: db.packsOpened(guildId, userId)
      }));
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
