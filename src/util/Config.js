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
      database: {
        enabled: false,
        options:
          process.env.NODE_ENV === 'developement'
            ? {
                log: [
                  { level: 'query', emit: 'event' },
                  { level: 'warn', emit: 'event' },
                  { level: 'info', emit: 'event' },
                  { level: 'error', emit: 'event' },
                ],
              }
            : {
                log: [{ level: 'error', emit: 'event' }],
              },
      },
      owners: [],
      intents: ['GUILDS', 'GUILD_MESSAGES', 'DIRECT_MESSAGES'],
      partials: ['CHANNEL'],
    };
  }
}

module.exports = Config;
