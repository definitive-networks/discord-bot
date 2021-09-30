const path = require('path');
const DiscordBot = require('../src');

const client = new DiscordBot({
  directories: { root: path.resolve(__dirname) },
  database: { enabled: false },
  owners: ['429077454636974090'],
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