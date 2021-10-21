'use strict';

class Config extends null {
  static createDefault() {
    return {
      directories: {
        root: null,
        commands: null,
        events: null,
        interactions: null,
      },
      defaultCommands: true,
      onReady: {
        registerCommands: true,
        sync: true,
      },
      unknownCommandResponse: true,
      owners: [],
      intents: ['GUILDS', 'GUILD_MESSAGES', 'DIRECT_MESSAGES'],
      partials: ['CHANNEL'],
    };
  }
}

module.exports = Config;
