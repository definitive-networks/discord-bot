'use strict';
const fs = require('fs');
const path = require('path');
const { Client } = require('discord.js');

const CommandsCollection = require('./CommandsCollection');
const DatabaseManager = require('./DatabaseManager');

class BotClient extends Client {
  constructor(options = {}) {
    super(options);

    this.config = {
      defaultPrefix: options.defaultPrefix ?? '!',
      commandsDir: options.commandsDir ?? (options.botDir && path.join(options.botDir, 'commands')),
      eventsDir: options.eventsDir ?? (options.botDir && path.join(options.botDir, 'events')),
    };

    this.owners = options.owner ?? [];
    this.database = new DatabaseManager(this);
    this.commands = new CommandsCollection(this);

    this.setCommands();
    this.setEvents();
  }

  setCommands(directory = this.config.commandsDir) {
    require('require-all')({
      dirname: directory,
      resolve: data =>
        this.commands.isValid(data)
          ? this.commands.set(data.name, data)
          : this.emit('warn', 'Command invalid, unable to load.', data),
    });
  }

  setEvents(directory = this.config.eventsDir) {
    this.once('ready', async () => {
      await this.commands.syncSlash(this);
    });
    this.on('messageCreate', async message => {
      await this.commands.handle(message, this);
    });
    this.on('interactionCreate', async interaction => {
      switch (true) {
        case interaction.isCommand(): {
          await this.commands.handle(interaction, this);
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
    fs.readdirSync(directory)
      .filter(file => file.endsWith('.js'))
      .map(file => {
        const event = require(`${directory}/${file}`);
        if (event.name && event.execute) {
          if (event.once) {
            this.once(event.name, async (...args) => {
              await event.execute(...args, this);
            });
          } else {
            this.on(event.name, async (...args) => {
              await event.execute(...args, this);
            });
          }
          return this.emit('debug', `A ${event.name} event has been created.`);
        } else {
          return this.emit('warn', 'Failed to create event for:', event);
        }
      });
  }

  start(bot_token) {
    this.login(bot_token ?? process.env.DISCORD_TOKEN);
  }
}

module.exports = BotClient;
