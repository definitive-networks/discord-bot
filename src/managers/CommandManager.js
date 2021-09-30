'use strict';

const { BaseManager, Collection } = require('discord.js');
const Command = require('../Command');
const { Util, Validator } = require('../util');

class CommandManager extends BaseManager {
  constructor(client) {
    super(client);

    this.cache = new Collection();
    this.registryCache = new Collection();
  }

  findCommand(command_name, guildId = 'global') {
    return this.cache.find(cmd => cmd.name === command_name && cmd.guildId === guildId) ?? null;
  }

  create(data) {
    return Validator.isCommand(data) && this.registryCache.set(data.name, new Command(this.client, data));
  }

  async respond(event) {
    const command = event.commandId && this.cache.get(event.commandId);
    if (!command || event.partial || event.author.bot || event.author.bot !== this.client.user.id) return;
    await command.execute(event, event.options, this.client);
  }

  async registerCommands(type) {
    const registeredCommands = new Collection();
    for (let cmd of this.registryCache.entries()) {
      if ((!type || type === 'global') && !cmd.guilds?.length) {
        // eslint-disable-next-line no-await-in-loop
        const registeredGlobalCommand = await this.register(cmd);
        if (registeredGlobalCommand) registeredCommands.set(registeredGlobalCommand.id, registeredGlobalCommand);
      }
      if ((!type || type === 'guilds') && cmd.guilds?.length) {
        // eslint-disable-next-line no-await-in-loop
        let guilds = await this.client.guilds.fetch();
        for (let guild of guilds.entries()) {
          // eslint-disable-next-line no-await-in-loop
          const registeredGuildCommand = await this.register(cmd, guild);
          if (registeredGuildCommand) registeredCommands.set(registeredGuildCommand.id, registeredGuildCommand);
        }
      }
    }
    return registeredCommands;
  }

  async register(registryCommand, guild) {
    if ((guild && !registryCommand.guilds?.length) || (!guild && registryCommand.guilds?.length)) return null;

    let storedCommand = this.findCommand(registryCommand.name, guild?.id ?? 'global');
    if (!storedCommand && this.client.database?.commands) {
      storedCommand = await this.client.database.getCommand(registryCommand.name, guild?.id ?? 'global');
    }

    const appCommand = storedCommand?.id && this.client.application.commands.fetch(storedCommand.id, guild?.id);
    const commandIsOutdated = appCommand && !Util.hasData(registryCommand.data, appCommand);

    let cacheCommand, postedCommand;
    if (!appCommand || commandIsOutdated) {
      postedCommand = appCommand
        ? await appCommand.edit(registryCommand.data)
        : await this.client.application.commands.create(registryCommand.data, guild?.id);
    }
    if (postedCommand || appCommand) {
      cacheCommand = new Command(this.client, registryCommand, postedCommand ?? appCommand);
      if (postedCommand || !this.cache.has(cacheCommand.id)) {
        this.cache.set(cacheCommand.id, cacheCommand);
        if (this.client.database?.commands) {
          await this.client.database.setCommand(cacheCommand);
        }
      }
    }
    return cacheCommand;
  }

  async deleteInvalidCommands(type) {
    const deletedCommands = new Collection();
    let appCommands = new Collection();
    if (!type || type === 'global') {
      appCommands = appCommands.concat(await this.client.application.commands.fetch());
    }
    if (!type || type === 'guilds') {
      let guilds = await this.client.guilds.fetch();
      if (guilds.size) {
        guilds.forEach(guild => {
          appCommands = appCommands.concat(guild.commands.fetch());
        });
      }
    }
    if (appCommands.size) {
      for (let cmd of appCommands.entries()) {
        // eslint-disable-next-line no-await-in-loop
        let deletedCommand = await this.deleteInvalid(cmd);
        if (deletedCommand) deletedCommands.set(deletedCommand.id, deletedCommand);
      }
    }
    return deletedCommands;
  }

  async deleteInvalid(appCommand) {
    let deletedCommand;
    const cachedCommand = this.cache.get(appCommand.id);
    switch (true) {
      case !cachedCommand:
      case appCommand.id !== cachedCommand.id:
      case appCommand.guild && !cachedCommand.guild:
      case !appCommand.guild && cachedCommand.guild: {
        deletedCommand = await this.delete(appCommand);
      }
    }
    return deletedCommand;
  }

  async sync() {
    return {
      registered: await this.registerCommands(),
      deleted: await this.deleteInvalidCommands(),
    };
  }

  deleteFromRegistry(appCommand) {
    const registryCommand = this.registryCache.find(cmd => {
      switch (true) {
        case cmd.name === appCommand.name:
        case (!appCommand.guild && !cmd.guilds) ||
          (appCommand.guild && cmd.guilds && cmd.guilds.includes(appCommand.guildId)): {
          return true;
        }
        default: {
          return false;
        }
      }
    });
    return registryCommand && this.registryCache.delete(appCommand.name);
  }

  async delete(appCommand) {
    this.deleteFromRegistry(appCommand);
    this.cache.delete(appCommand.id);
    if (this.client.database?.commands) {
      await this.client.database.commands.delete({
        where: {
          guildId: appCommand.guild ? appCommand.guildId : 'global',
          name: appCommand.name,
        },
      });
    }
    return appCommand.delete();
  }
}

module.exports = CommandManager;
