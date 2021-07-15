module.exports = {
  name: 'ping',
  description: "Ping the bot",
  guildOnly: false,
  permissions: {
    channel: ['VIEW_CHANNEL', 'SEND_MESSAGES'],
  },
  aliases: ['ms','pong'],
  execute(message, args, client) {
    message.channel.send('Pong!');
  },
  SlashCommand: {
    execute(interaction, args, client) {
      interaction.reply('Pong!');
    }
  }
}
