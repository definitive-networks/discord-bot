<p align="center">
  <a href="https://github.com/definitive-networks/discord-bot" target="_blank">
    <strong>Discord Bot</strong>
  </a>
</p>

<p align="center"><em>Discord.js · Quick.db</em></p>

---

## About
Discord Bot isn't a bot, but a simple and flexible framework using [discord.js](https://github.com/discordjs/discord.js), so that you can get your own bot up and running quick.
  - [Quick.db](https://quickdb.js.org/) integrated for easy access to persistent storage (also used for Slash Commands)
  - Command aliases and permissions
  - `interactionButton` and `interactionSelect` events
  - No forced features

## Installation
Ensure you have [Node.js](https://nodejs.org/) 14.0.0 or higher installed, then run:

```sh-session
npm install discord.js@dev @definitive-networks/discord-bot
```

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
  aliases: ['ms'],
  execute(message, args, client) {
    message.channel.send('Pong!');
  },
  SlashCommand: {
    execute(interaction, args, client) {
      interaction.reply('Pong!');
    }
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
