'use strict';

const { existsSync } = require('fs');
const path = require('path');
const { oneLine } = require('common-tags');
const { Client, Util } = require('discord.js');
const permissionsCommand = require('./commands/permissions.js');
const pingCommand = require('./commands/ping.js');
const CommandManager = require('./managers/CommandManager');
const { Config, Validator } = require('./util');

class BotClient extends Client {
  constructor(options = {}) {
    super(options);

    this.config = Util.mergeDefault(Config.createDefault(), options);

    for (const [key, val] of Object.entries(this.config.directories)) {
      if (key === 'root') {
        if (typeof val !== 'string' || !existsSync(val)) {
          throw new Error(`Invalid directory was provided for ${key}: ${val}`);
        }
        continue;
      }

      const directory = (typeof val === 'string' && val.length)
        ? val.split('/').filter(data => data)
        : (val === true ? [key] : false);
        
      this.config.directories[key] = directory && path.join(
        ...(this.config.directories.root && [this.config.directories.root]),
        ...directory,
      );

      if (this.config.directories[key] && !existsSync(this.config.directories[key])) {
        throw new Error(`Invalid directory was provided for ${key}: ${this.config.directories[key]}`);
      }
    }

    this.commands = new CommandManager(this);
    this.registry = new Registry(this);

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
        if (this.config.defaultCommands) {
          this.commands.registerMany([
            ...((this.config.defaultCommands === true || this.config.defaultCommands.ping) && [pingCommand]),
            ...((this.config.defaultCommands === true || this.config.defaultCommands.permissions) && [
              permissionsCommand,
            ]),
          ]);
        }
        if (this.config.onReady.registerCommands) {
          this.commands.registerFrom(this.config.directories.commands);
        }
        if (this.config.onReady.sync) await this.commands.sync();
      });

      this.on('guildCreate', async guild => {
        await this.commands.syncGuild(guild.id);
        await this.commands.syncPermissions(guild.id);
      });
    }

    if (this.config.directories.interactions) {
      require('require-all')({
        dirname: this.config.directories.interactions,
        resolve: data => {
          if (!data.customId && data.name) data.customId = data.name;
          if (data.customId && typeof data.customId !== 'string') {
            throw new TypeError('Interaction name/customId must be a string.');
          }
          if (typeof data.run !== 'function') throw new TypeError('Interaction run must be a function.');
          this.registry.actions.set(data.customId, data);
          this.emit('debug', `Interaction action registered: ${data.customId}`);
        },
      });
    }

    if (this.config.directories.events) {
      require('require-all')({
        dirname: this.config.directories.events,
        resolve: data => {
          if (typeof data.name !== 'string') throw new TypeError('Event name must be a string.');
          if (typeof data.run !== 'function') throw new TypeError('Event run must be a function.');
          
          this[Boolean(data.once) ? 'once' : 'on'](data.name, async (...args) => {
            await data.run(...args, this);
          });
          this.emit('debug', `Event action registered: ${data.name}`);
        },
      });
    }

    this.on('interactionCreate', async interaction => {
      if (!interaction.isCommand() || !interaction.isContextMenu()) {
        const action = await this.registry.actions.get(interaction.customId);
        return action?.run(interaction, interaction.options, this);
      } else {
        const command = this.registry.getCommandFromInteraction(interaction);

        if (command.guildOnly && !interaction.inGuild()) {
          this.emit('commandBlock', this, 'guildOnly');
          return command.onBlock(this, 'guildOnly');
        }

        if (command.nsfw && !interaction.channel.nsfw) {
          this.emit('commandBlock', this, 'nsfw');
          return command.onBlock(this, 'nsfw');
        }

        const hasPermission = command.hasPermission(interaction);
        if (!hasPermission || typeof hasPermission === 'string') {
          const data = { response: typeof hasPermission === 'string' ? hasPermission : undefined };
          this.emit('commandBlock', interaction, 'permission', data);
          return command.onBlock(interaction, 'permission', data);
        }

        if (interaction.channel.type === 'text' && command.clientPermissions) {
          const missing = interaction.channel.permissionsFor(this.user).missing(command.clientPermissions);
          if (missing.length > 0) {
            const data = { missing };
            this.emit('commandBlock', this, 'clientPermission', data);
            return command.onBlock(this, 'clientPermissions', data);
          }
        }

        const throttle = command.throttle(interaction.user.id);
        if (throttle && throttle.usages + 1 > command.throttler.usages) {
          const remaining = (throttle.start + (command.throttler.duration * 1000) - Date.now()) / 1000;
          const data = { throttle, remaining };
          this.emit('commandBlock', this, 'throttling', data);
          return command.onBlock(this, 'throttling', data);
        }

        if (throttle) throttle.usages++;
        try {
          this.client.emit('debug', `Running command ${command.type}:${command.name}.`);
          const promise = command.run(interaction, this);

          this.client.emit('commandRun', command, promise, interaction);
          const retVal = await promise;
          if (!(retVal instanceof Message || retVal instanceof Array || retVal === null || retVal === undefined)) {
            throw new TypeError(oneLine`
              Command ${command.name}'s run() resolved with an unknown type
              (${retVal !== null ? retVal && retVal.constructor ? retVal.constructor.name : typeof retVal : null}).
              Command run methods must return a Promise that resolve with a Message, Array of Messages, or null/undefined.
            `);
          }
          return retVal;
        } catch(err) {
          this.emit('commandError', command, err, interaction);
          if (err instanceof FriendlyError) {
            return interaction.replied
              ? interaction.followUp({ content: err.message, ephemeral: err.ephemeral })
              : interaction.reply({ content: err.message, ephemeral: err.ephemeral });
          } else {
            return command.onError(err, interaction);
          }
        }
      }
    });
  }

  get owners() {
    if (!this.config.owners) return null;
    if (typeof this.options.owners === 'string') return [this.users.cache.get(this.config.owners)];
    const owners = [];
    for (const owner of this.config.owners) owners.push(this.users.cache.get(owner));
    return owners;
  }

  isOwner(user) {
    if (!this.config.owners) return false;
    user = this.users.resolve(user);
    if (!user) throw new RangeError('Unable to resolve user.');
    if (typeof this.config.owners === 'string') return user.id === this.config.owners;
    if (this.config.owners instanceof Array) return this.config.owners.includes(user.id);
    if (this.config.owners instanceof Set) return this.config.owners.has(user.id);
    throw new RangeError('The client\'s "owner" option is an unknown value.');
  }

  start(bot_token) {
    this.login(bot_token ?? this.token);
  }

  async stop() {
    await super.destroy();
  }
}

module.exports = BotClient;
