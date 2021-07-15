const { MessageActionRow, MessageButton } = require('discord.js');

const row = new MessageActionRow().addComponents(
  new MessageButton()
    .setLabel('Example Button')
    .setCustomId('example_button')
    .setStyle('PRIMARY'),
);

module.exports = {
  name: 'button',
  description: 'Example buttons',
  group: 'Examples',
  permissions: {
    channel: ['VIEW_CHANNEL', 'SEND_MESSAGES'],
  },
  aliases: ['btn'],
  execute(message, args, client) {
    message.channel.send({
      content: 'You can find an example button below!', 
      components: [row]
    });
  },
  SlashCommand: {
    async execute(interaction, args, client) {
      await interaction.reply({
        content: 'You can find an example button below!',
        components: [row]
      });
    }
  }
}
