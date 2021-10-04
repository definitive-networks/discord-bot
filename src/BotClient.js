'use strict';

const { existsSync } = require('fs');
const path = require('path');
const { oneLine } = require('common-tags');
const { Client } = require('discord.js');
const CommandManager = require('./managers/CommandManager');
const { Config, Util, Validator } = require('./util');

class BotClient extends Client {
  constructor(options = {}) {
    super(options);

    this.config = Util.mergeDefault(Config.createDefault(), options);

    for (const [key, val] of Object.entries(this.config.directories)) {
      if (key === 'root') {
        if (!val || !existsSync(val)) {
          throw new Error(`Invalid directory was provided for ${key}: ${val}`);
        }
        continue;
      }
      this.config.directories[key] =
        typeof val === 'boolean' && val === false
          ? val
          : path.join(
              this.config.directories.root,
              ...(typeof val === 'string' && val.length ? val.split('/').filter(data => data) : [key]),
            );
      if (this.config.directories[key] && !existsSync(this.config.directories[key])) {
        throw new Error(`Invalid directory was provided for ${key}: ${this.config.directories[key]}`);
      }
    }

    if (this.config.database && this.config.database.enabled) {
      try {
        if (require.resolve('@prisma/client')) {
          const { DatabaseManager } = require('./managers/DatabaseManager');
          this.database = new DatabaseManager(this, this.config.database.options);
        }
      } catch (err) {
        throw new Error(err);
      }
    }

    this.commands = new CommandManager(this);

    if (process.env.NODE_ENV === 'development') {
      this.on('error', err => console.error(err));
      this.on('debug', message => console.log(message));
      this.on('warn', info => console.log(info));
      this.on('applicationCommandCreate', cmd => {
        this.emit(
          'debug',
          `Created "${cmd.name}" command ${cmd.guild ? `in ${cmd.guild.name} (${cmd.guildId})` : 'globally'}.`,
        );
      });
      this.on('applicationCommandDelete', cmd => {
        this.emit(
          'debug',
          `Deleted "${cmd.name}" command ${cmd.guild ? `in ${cmd.guild.name} (${cmd.guildId})` : 'globally'}.`,
        );
      });
      this.on('applicationCommandUpdate', ({ newCommand: cmd }) => {
        this.emit(
          'debug',
          `Updated "${cmd.name}" command ${cmd.guild ? `in ${cmd.guild.name} (${cmd.guildId})` : 'globally'}.`,
        );
      });
    }

    if (this.config.directories.commands) {
      this.once('ready', async () => {
        if (this.config.onReady.registerCommands) {
          this.commands.registerFrom(this.config.directories.commands);
        }
        if (this.config.onReady.sync) await this.commands.sync();
      });
    }

    if (this.config.directories.interactions) {
      require('require-all')({
        dirname: this.config.directories.interactions,
        resolve: data => {
          const validator = Validator.isInteraction(data);
          if (validator && !validator.error) {
            this.on('interactionCreate', async interaction => {
              if ('customId' in interaction && interaction.customId === (data.customId || data.name)) {
                await data.execute(interaction, interaction.options, this);
              }
            });
            this.emit('debug', `Interaction action created: ${data.customId || data.name}`);
          } else {
            this.emit('warn', `Invalid interaction action data: ${data}`);
          }
        },
      });
    }

    if (this.config.directories.events) {
      require('require-all')({
        dirname: this.config.directories.events,
        resolve: data => {
          const validator = Validator.isEvent(data);
          if (validator && !validator.error) {
            this[data.once ? 'once' : 'on'](data.name, async (...args) => {
              await data.execute(...args, this);
            });
            this.emit('debug', `Event action created: ${data.name}`);
          } else {
            this.emit('warn', `Invalid event action data: ${data}`);
          }
        },
      });
    }

    this.on('interactionCreate', async interaction => {
      if (interaction.isCommand() || interaction.isContextMenu()) {
        const command = this.commands.getFromInteraction(interaction);

        if (!command) {
          this.emit(
            'debug',
            `Unknown command requested: ${interaction.commandName} (${interaction.commandId}, ${
              interaction.inGuild() ? `guild ${interaction.guildId}` : `user ${interaction.user.id}`
            })`,
          );
          if (this.config.unknownCommandResponse) {
            await interaction.reply({
              content: oneLine`
                This command no longer exists.
                It should no longer show up within the hour if it has been deleted.
              `,
              ephemeral: true,
            });
          }
          return;
        }

        const hasPermission = command.hasPermission(interaction);
        if (!hasPermission || typeof hasPermission === 'string') {
          const data = { ...(typeof hasPermission === 'string' && { response: hasPermission }) };
          await command.onBlock(interaction, 'permission', data);
        }

        const throttle = command.throttle(interaction.user.id);
        if (throttle && command.throttler && throttle.usages + 1 > command.throttler.usages) {
          const remaining = (throttle.start + command.throttler.duration * 1000 - Date.now()) / 1000;
          const data = { throttle, remaining };
          await command.onBlock(interaction, 'throttling', data);
        }

        if (throttle) throttle.usages++;
        await command.execute(interaction, this.client);
      }
    });
  }

  get owners() {
    if (!this.config.owners || !this.config.owners.length) return null;
    return typeof this.config.owners === 'string' ? [this.config.owners] : [...new Set(this.config.owners)];
  }

  isOwner(user) {
    const resolvedUser = this.users.resolve(user);
    return this.owners?.length && this.owners.includes(resolvedUser.id);
  }

  start(bot_token) {
    this.login(bot_token ?? this.token);
  }
}

module.exports = BotClient;
