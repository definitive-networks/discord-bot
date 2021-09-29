<p align="center">
  <a href="https://github.com/definitive-networks/discord-bot" target="_blank">
    <strong>Discord Bot</strong>
  </a>
</p>

<p align="center"><em>Discord.js · Prisma</em></p>

---

## About
Discord Bot is a simple and powerful extension for [discord.js](https://github.com/discordjs/discord.js), so that you can get your own bot up and running quick.
  - [Prisma](https://prisma.io) integrated for easy access to persistent storage ([slash commands integrated](#db-info))
  - Modular interactions and events
  - Easily integrate into an existing project

## Installation
Ensure you have [Node.js](https://nodejs.org/) 16.0.0 or higher installed, then run:

```sh-session
npm install discord.js @definitive-networks/discord-bot
```

By default discord-bot doesn't require a database, however commands won't persist across restarts!
To make use of persistent storage, add the following dependency:
```sh-session
npm install prisma
```
If you wish to change the default database settings, or use a different type altogether, take a look at [Prisma's documentation](https://prisma.io).

<details id="db-info">
  <summary>Database Information</summary>
  <table>
    <tr>
      <th>Table</th>
      <th>Default Columns</th>
      <th>Info</th>
    </tr>
    <tr>
      <td>Users</td>
      <td><code>uid</code></td>
      <td>Placeholder</td>
    </tr>
    <tr>
      <td>Guilds</td>
      <td><code>gid, prefix, disable_commands</code></td>
      <td>The bot will make use of a "prefix" column and a "disable_commands" column for permissiong checking, if used.</td>
    </tr>
    <tr>
      <td>Commands</td>
      <td><code>cid, name, guild</code></td>
      <td>Slash commands store their IDs here when they get created. This is used for finding existing slash commands on startup and managing them.</td>
    </tr>
  </table>
  
</details>

## Example Usage

```js
// ./index.js
const path = require('path');
const DiscordBot = require('@definitive-networks/discord-bot');

const client = new DiscordBot({
  botDir: path.resolve(__dirname),
  defaultPrefix: '?',
  intents: ['GUILDS', 'GUILD_MESSAGES']
});

client.start(/*DISCORD BOT TOKEN*/);
```

##### Command Example
```js
// ./commands/ping.js
module.exports = {
  name: 'ping',
  description: 'Ping the bot',
  execute(interaction, options, client) {
    interaction.reply(`Pong! \`${Date.now() - interaction.createdTimestamp}ms\``);
  }
}
```

##### Event Example
```js
// ./events/ready.js
module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`Logged in as: ${client.user.tag}`);
  }
}
```

## Documentation
Check out the [wiki](https://github.com/definitive-networks/discord-bot/wiki) for more examples and documentation.
