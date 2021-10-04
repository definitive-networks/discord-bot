module.exports = {
  name: 'ping',
  description: 'Ping the bot',
  guildIds: ['429077454636974090'],
  requiredPermissions: {
    channel: ['VIEW_CHANNEL', 'SEND_MESSAGES'],
  },
  execute: (interaction, client) => {
    interaction.reply('Pong!');
  },
}
