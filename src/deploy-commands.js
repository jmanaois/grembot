import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commands } from "./command.js";

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  throw new Error("DISCORD_TOKEN and CLIENT_ID must be set. Copy .env.example to .env.");
}

const rest = new REST().setToken(DISCORD_TOKEN);
const route = GUILD_ID
  ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
  : Routes.applicationCommands(CLIENT_ID);

await rest.put(route, { body: commands.map(command => command.toJSON()) });
console.log(`Registered ${commands.map(command => `/${command.name}`).join(", ")} ${GUILD_ID ? `in guild ${GUILD_ID}` : "globally"}.`);
