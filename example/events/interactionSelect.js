module.exports = {
  name: 'interactionSelectMenu',
  execute(selectMenu, client) {
    switch (selectMenu.customId) {
      case ('example_select_menu'): {
        if (selectMenu.values.includes('positive')) {
          selectMenu.reply('You selected a positive choice!');
        } else if (selectMenu.values.includes('negative')) {
          selectMenu.reply('You selected a negative choice!');
        }
        break;
      }
    }
  }
};