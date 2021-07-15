const DiscordBot = require('../src');
const path = require('path');

const client = new DiscordBot({
  botDir: path.resolve(__dirname),
  owners: ['429077454636974090'],
  defaultPrefix: 'devb ',
  intents: ['GUILDS', 'GUILD_MESSAGES', 'DIRECT_MESSAGES'],
  partials: ['CHANNEL'],
  presence: {
    status: 'dnd',
    activities: [{
      name: 'around',
      type: 'PLAYING'
    }]
  }
});

client.start(/* INSERT BOT TOKEN HERE || process.env.DISCORD_TOKEN */);