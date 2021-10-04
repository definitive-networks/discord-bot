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
  requiredPermissions: {
    channel: ['VIEW_CHANNEL', 'SEND_MESSAGES'],
  },
  execute: (interaction, client) => {
    interaction.reply({
      content: 'You can find an example button below!', 
      components: [row]
    });
  }
}
