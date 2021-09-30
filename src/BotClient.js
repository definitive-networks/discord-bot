'use strict';

const path = require('path');
const { Client } = require('discord.js');
const { CommandManager, DatabaseManager } = require('./managers');
const { Config, Util } = require('./util');

class BotClient extends Client {
  constructor(options = {}) {
    super(options);

    this.config = Util.mergeDefault(Config.createDefault(), options);

    if (this.config.botDir) {
      if (!this.config.commandsDir) {
        this.config.commandsDir = path.join(this.config.botDir, 'commands');
      }
      if (!this.config.eventsDir) {
        this.config.eventsDir = path.join(this.config.botDir, 'events');
      }
      if (!this.config.interactionsDir) {
        this.config.interactionsDir = path.join(this.config.interactionsDir, 'interactions');
      }
    }

    if (this.config.database && this.config.database.enabled) {
      try {
        if (require.resolve('@prisma/client')) {
          this.database = new DatabaseManager(this, this.config.database.options);
        }
      } catch (error) {
        console.error("Module not found: @prisma/client");
        process.exit(error.code);
      }
    }

    this.commands = new CommandManager(this);

    this.on('error', err => console.log(err));

    if (process.env.NODE_ENV === 'development') this.initDebugEvents();

    if (Boolean(this.config.initCommands) === true) this.initCommands();
    if (Boolean(this.config.initEvents) === true) this.initEvents();
    if (Boolean(this.config.initInteractions) === true) this.initInteractions();
  }

  get owners() {
    if (!this.config.owners || !this.config.owners.length) return null;
    if (typeof this.config.owners === 'string') return [this.config.owners];
    const owners = [];
    this.config.owners.forEach(owner => owners.push(owner));
    return owners;
  }

  isOwner(user) {
    const resolvedUser = this.users.resolve(user);
    return this.owners?.length && this.owners.includes(resolvedUser);
  }

  initCommands(directory = this.config.commandsDir) {
    require('require-all')({
      dirname: directory,
      resolve: data => this.commands.create(data),
    });
  }

  initDebugEvents() {
    this.on('applicationCommandCreate', command => {
      this.emit(
        'debug',
        `Created "${command.name}" command ${
          command.guildId ? `in ${command.guild.name} (${command.guildId})` : 'globally'
        }.`,
      );
    });
    this.on('applicationCommandDelete', command => {
      this.emit(
        'debug',
        `Deleted "${command.name}" command ${
          command.guildId ? `in ${command.guild.name} (${command.guildId})` : 'globally'
        }.`,
      );
    });
    this.on('applicationCommandUpdate', ({ newCommand: command }) => {
      this.emit(
        'debug',
        `Updated "${command.name}" command ${
          command.guildId ? `in ${command.guild.name} (${command.guildId})` : 'globally'
        }.`,
      );
    });
    this.on('debug', message => console.log(message));
    this.on('warn', info => console.log(info));
  }

  initEvents(directory = this.config.eventsDir) {
    require('require-all')({
      dirname: directory,
      resolve: data => {
        if (Validator.isEvent(data)) {
          if (data.once) {
            this.once(data.name, async (...args) => {
              await data.execute(...args, this).catch(err => this.emit('error', err));
            });
          } else {
            this.on(data.name, async (...args) => {
              await data.execute(...args, this).catch(err => this.emit('error', err));
            });
          }
          return this.emit('debug', `Event created: ${data.name}`);
        }
        return this.emit('warn', `Event failed to create: ${data}`)
      },
    });
    this.once('ready', () => this.commands.sync().catch(err => this.emit('error', err)));
    this.on('interactionCreate', interaction => {
      if (interaction.isCommand() || interaction.isContextMenu()) {
        this.commands.handle(interaction).catch(err => this.emit('error', err));
      }
    });
  }

  initInteractions(directory = this.config.interactionsDir) {
    require('require-all')({
      dirname: directory,
      resolve: execute => {
        this.on('interactionCreate', interaction => {
          await execute(interaction, interaction.options, this);
        });
      },
    });
  }

  start(bot_token = this.token) {
    this.login(bot_token);
  }

  async destroy() {
    await super.destroy();
    if (this.database) await this.database.$disconnect();
  }
}

module.exports = BotClient;
