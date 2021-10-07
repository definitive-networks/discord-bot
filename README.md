<p align="center">
  <a href="https://github.com/definitive-networks/discord-bot" target="_blank">
    <strong>Discord Bot</strong>
  </a>
</p>

<p align="center"><em>Discord.js</em></p>

---

## About
Discord Bot is a simple and powerful extension for [discord.js](https://github.com/discordjs/discord.js), so that you can get your own bot up and running quick.
  - Easily integrate into an existing project
  - Modular commands, interactions, and events
  - Auto sync commands and permissions on startup
  - Optional utility commands
  - Command cooldowns

## Installation
Ensure you have [Node.js](https://nodejs.org/) 16.0.0 or higher installed, then run:

```sh-session
npm install discord.js @definitive-networks/discord-bot
```

## Example Usage

```js
// ./index.js
const DiscordBot = require('@definitive-networks/discord-bot');

const client = new DiscordBot({
  directories: { root: __dirname },
  intents: ['GUILDS', 'GUILD_MESSAGES'],
});

client.start(/*DISCORD BOT TOKEN*/);
```

##### Command Example
```js
// ./commands/ping.js
module.exports = {
  name: 'hello',
  description: 'Say hi!',
  execute: (interaction, client) => {
    interaction.reply(`Hello, <@${interaction.user.id}>!`);
  }
}
```

##### Event Example
```js
// ./events/ready.js
module.exports = {
  name: 'ready',
  once: true,
  execute: (client) => {
    console.log(`Logged in as: ${client.user.tag}`);
  }
}
```

##### Interaction Example
```js
// ./interactions/buttonTest.js
module.exports = {
  name: 'button_test', // An interaction's customId if one exists
  execute: (interaction, client) => {
    interaction.reply('Thanks for clicking!');
  }
}
```

## Documentation
Check out the [wiki](https://github.com/definitive-networks/discord-bot/wiki) for more examples and documentation.
