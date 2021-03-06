const { MessageActionRow, MessageSelectMenu } = require('discord.js');

const row = new MessageActionRow()
  .addComponents(
    new MessageSelectMenu()
      .setCustomId('example_select_menu')
      .setPlaceholder('Make a choice!')
      .setMaxValues(1)
      .setMinValues(1)
      .addOptions([
        {
          label: 'Choice #1',
          description: 'A positive choice!',
          value: 'positive',
          emoji: '✅',
        },
        {
          label: 'Choice #2',
          description: 'A negative choice!',
          value: 'negative',
          emoji: '❌'
        }
      ]),
  );

module.exports = {
  name: 'menu',
  description: 'Example select menu',
  group: 'Examples',
  permissions: {
    channel: ['VIEW_CHANNEL', 'SEND_MESSAGES'],
  },
  aliases: ['select', 'sel'],
  execute(message, args, client) {
    message.channel.send({
      content: 'You can find an example select menu below!', 
      components: [row]
    });
  },
  SlashCommand: {
    async execute(interaction, args, client) {
      await interaction.reply({
        content: 'You can find an example select menu below!',
        components: [row]
      });
    }
  }
}
