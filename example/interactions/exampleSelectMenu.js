module.exports = {
  customId: 'example_select_menu',
  execute(interaction, client) {
    if (interaction.values.includes('positive')) {
      interaction.reply('You selected a positive choice!');
    } else if (interaction.values.includes('negative')) {
      interaction.reply('You selected a negative choice!');
    }
  }
};