module.exports = {
  name: 'interactionButton',
  execute(button, client) {
    switch (button.customId) {
      case ('example_button'): {
        button.reply('You clicked the example button!');
        break;
      }
    }
  }
};