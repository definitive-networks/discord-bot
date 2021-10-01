'use strict';

const { existsSync } = require('fs');
const path = require('path');
const { Client } = require('discord.js');
const CommandManager = require('./managers/CommandManager');
const { Config, Util, Validator } = require('./util');

class BotClient extends Client {
  constructor(options = {}) {
    super(options);

    this.config = Util.mergeDefault(Config.createDefault(), options);

    for (const [key, val] of Object.entries(this.config.directories)) {
      if (key === 'root') {
        if (!val || !existsSync(val)) throw new Error('DIRECTORY_INVALID', key);
        continue;
      }
      this.config.directories[key] =
        val === false
          ? false
          : path.join(
              this.config.directories.root,
              ...(typeof val === 'string' ? val.split('/').filter(data => data) : [key]),
            );
      if (val !== false && !existsSync(this.config.directories[key])) {
        throw new Error('DIRECTORY_INVALID', key);
      }
    }

    if (this.config.database && this.config.database.enabled) {
      try {
        if (require.resolve('@prisma/client')) {
          const { DatabaseManager } = require('./managers');
          this.database = new DatabaseManager(this, this.config.database.options);
        }
      } catch (error) {
        throw new Error(error);
      }
    }

    this.commands = new CommandManager(this);

    this.on('error', err => console.error(err));

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

  initCommands(directory = this.config.directories.commands) {
    require('require-all')({
      dirname: directory,
      resolve: data => this.commands.create(data),
    });
  }

  initDebugEvents() {
    this.on('applicationCommandCreate', command => {
      this.emit(
        'debug',
        `Created "${command.name}" command (${command.id}) ${
          command.guild ? `in ${command.guild.name} (${command.guildId})` : 'globally'
        }.`,
      );
    });
    this.on('applicationCommandDelete', command => {
      this.emit(
        'debug',
        `Deleted "${command.name}" command ${
          command.guild ? `in ${command.guild.name} (${command.guildId})` : 'globally'
        }.`,
      );
    });
    this.on('applicationCommandUpdate', ({ newCommand: command }) => {
      this.emit(
        'debug',
        `Updated "${command.name}" command ${
          command.guild ? `in ${command.guild.name} (${command.guildId})` : 'globally'
        }.`,
      );
    });
    this.on('debug', message => console.log(message));
    this.on('warn', info => console.log(info));
  }

  initEvents(directory = this.config.directories.events) {
    require('require-all')({
      dirname: directory,
      resolve: data => {
        if (Validator.isEvent(data)) {
          this[data.once ? 'once' : 'on'](data.name, async (...args) => {
            await data.execute(...args, this).catch(err => this.emit('error', err));
          });
          return this.emit('debug', `Event created: ${data.name}`);
        }
        return this.emit('warn', `Event failed to create: ${data}`);
      },
    });
    this.once('ready', () => this.commands.sync().catch(err => this.emit('error', err)));
    this.on('interactionCreate', interaction => {
      if (interaction.isCommand() || interaction.isContextMenu()) {
        this.commands.handle(interaction).catch(err => this.emit('error', err));
      }
    });
  }

  initInteractions(directory = this.config.directories.interactions) {
    require('require-all')({
      dirname: directory,
      resolve: data => {
        if (Validator.isInteraction(data)) {
          this.on('interactionCreate', async interaction => {
            await data.execute(interaction, interaction.options, this);
          });
        }
      },
    });
  }

  start(bot_token = this.token) {
    this.login(bot_token);
  }

  async destroy() {
    super.destroy();
    if (this.database) await this.database.$disconnect();
  }
}

module.exports = BotClient;
