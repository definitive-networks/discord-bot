module.exports = (interaction, options, client) => {
  if (interaction.customId === 'example_button') {
    interaction.reply('You clicked the button!');
  }
}