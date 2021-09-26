'use strict';

const path = require('path');
const { Client } = require('discord.js');
const CommandsManager = require('./CommandManager');
const DatabaseManager = require('./DatabaseManager');

class BotClient extends Client {
  constructor(options = {}) {
    super(options);

    this.config = {
      commandsDir: options.commandsDir ?? (options.botDir && path.join(options.botDir, 'commands')),
      eventsDir: options.eventsDir ?? (options.botDir && path.join(options.botDir, 'events')),
    };

    this.owners = options.owner ?? [];

    if (options.database && options.database.enabled) {
      try {
        if (require.resolve('@prisma/client')) {
          this.database = new DatabaseManager(this);
        }
      } catch (error) {
        console.error("Prisma client can't be found!");
        process.exit(error.code);
      }
    }

    this.commands = new CommandsManager(this);

    this.setCommands();
    this.setEvents();
  }

  setCommands(directory = this.config.commandsDir) {
    require('require-all')({
      dirname: directory,
      resolve: data => this.commands.create(data),
    });
  }

  setEvents(directory = this.config.eventsDir) {
    require('require-all')({
      dirname: directory,
      resolve: data => {
        if (data.name && data.execute) {
          if (data.once) {
            this.once(data.name, async (...args) => {
              await data.execute(...args, this);
            });
          } else {
            this.on(data.name, async (...args) => {
              await data.execute(...args, this);
            });
          }
          return this.emit('debug', `A ${data.name} event has been created.`);
        }
        return this.emit('warn', `Failed to create event for:\n${data}`);
      },
    });
    this.once('ready', async () => {
      await this.commands.syncSlash();
    });
    this.on('messageCreate', async message => {
      await this.commands.handle(message);
    });
    this.on('interactionCreate', async interaction => {
      switch (true) {
        case interaction.isCommand(): {
          await this.commands.handle(interaction);
          break;
        }
        case interaction.isButton(): {
          this.emit('interactionButton', interaction);
          break;
        }
        case interaction.isSelectMenu(): {
          this.emit('interactionSelectMenu', interaction);
          break;
        }
      }
    });
    if (process.env.NODE_ENV === 'development') {
      this.on('debug', message => console.log(message));
      this.on('warn', info => console.log(info));
      this.on('error', error => console.log(error));
    }
  }

  start(bot_token) {
    this.login(bot_token ?? process.env.DISCORD_TOKEN);
  }
}

module.exports = BotClient;
