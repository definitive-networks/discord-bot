'use strict';

const { BaseManager, Collection } = require('discord.js');
const Command = require('../Command');
const { Util } = require('../util');

class CommandManager extends BaseManager {
  constructor(client) {
    super(client);

    this.cache = new Collection();
    this.registryCache = new Collection();
  }

  async create(data) {
    return Validator.isCommand(data) && this.registryCache.set(data.name, new Command(this.client, data));
    const commandEntry = await this.client.database.commands.upsert({
      where: { id: data.id },
      update: { 
        guildId: data.guildId, 
        name: data.commandName 
      },
      create: { 
        id: data.id, 
        guildId: data.guildId, 
        name: data.commandName 
      },
    });
  }

  async respond(event) {
    const command = event.commandId && this.cache.find(cmd => cmd.ids.includes(event.commandId));
    if (!command || event.partial || event.author.bot || (event.author.bot !== this.client.user.id)) return;
    return command.execute(event, event.options, this.client);
  }

  async registerCommands(type) {
    const registeredCommands = new Collection();
    if (this.registryCache.size) {
      for (let cmd of this.registryCache.entries()) {
        if ((!type || type === 'guilds') && cmd.guilds?.length) {
          for (let guild of guilds.entries()) {
            const registeredGuildCommand = await this.register(cmd, guild);
            if (registeredGuildCommand) registeredCommands.set(registeredGuildCommand.id, registeredGuildCommand);
          }
        }
        if ((!type || type === 'global') && !cmd.guilds?.length) {
          const registeredGlobalCommand = await this.register(cmd);
          if (registeredGlobalCommand) registeredCommands.set(registeredGlobalCommand.id, registeredGlobalCommand);
        }
      }
    }
    return registeredCommands;
  }

  async register(registryCommand, guild) {
    if ((guild && !registryCommand.guilds?.length) || (!guild && registryCommand.guilds?.length)) return;

    const storedCommand = this.client.database?.commands && await this.client.database.getCommand(registryCommand.name, guild?.id ?? 'global');
    const appCommand = storedCommand?.id && this.client.application.commands.fetch(storedCommand.id, guild?.id);
    const commandMatches = appCommand && Util.hasData(registryCommand.data, appCommand);

    if (commandMatches) return;

    let postedCommand = (appCommand)
      ? await appCommand.edit(registryCommand.data)
      : await this.client.application.commands.create(registryCommand.data, guild?.id);

    if (this.client.database?.commands) await this.client.database.setCommand(postedCommand);

    return postedCommand;
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
        let deletedCommand = await this.deleteInvalid(cmd);
        if (deletedCommand) deletedCommands.set(deletedCommand.id, deletedCommand);
      }
    }
    return deletedCommands; 
  }

  async deleteInvalid(appCommand) {
    const cachedCommand = this.cache.get(appCommand.id);
    switch (true) {
      case (!cachedCommand):
      case (appCommand.id !== cachedCommand.id):
      case (appCommand.guild && !cachedCommand.guild):
      case (!appCommand.guild && cachedCommand.guild): {
        return this.delete(appCommand);
      }
      default: {
        return;
      }
    }
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
        case (cmd.name === appCommand.name):
        case ((!appCommand.guild && !cmd.guilds) || (appCommand.guild && cmd.guilds && cmd.guilds.includes(appCommand.guildId))): {
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