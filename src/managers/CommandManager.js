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

  async findAppCommand(commandName, guildId) {
    let commands, result;
    if (!guildId) {
      commands = await this.client.application.commands.fetch();
      result = commands.find(cmd => cmd.name === commandName);
    } else {
      let guild = await this.client.guilds.fetch(guildId);
      commands = await guild.commands.fetch();
      result = commands.find(cmd => cmd.name === commandName);
    }
    return result ?? null;
    return this.cache.find(cmd => cmd.name === command_name && cmd.guildId === guildId) ?? null;
  }

  create(data) {
    return Validator.isCommand(data) && this.cache.set(data.name, new Command(this.client, data));
  }

  async respond(interaction) {
    const command = interaction.commandId && this.cache.find(cmd => {
      return cmd.name === interaction.commandName 
        && cmd.ids.includes(interaction.commandId)
      }
    );
    const command = interaction.commandId && this.cache.get(interaction.commandId);
    if (!command) return;
    if (interaction.user.bot && interaction.user.id !== this.client.user.id) return;
    if (interaction.guild && !interaction.guild.available) return;
    await command.execute(interaction, interaction.options, this.client);
  }

  async registerCommands(type) {
    const registeredCommands = new Collection();
    let registeredGlobalCommand, registeredGuildCommand;
    for (let cmd of this.registryCache.entries()) {
      if ((!type || type === 'global') && !cmd.guilds?.length) {
        // eslint-disable-next-line no-await-in-loop
        registeredGlobalCommand = await this.register(cmd);
        if (registeredGlobalCommand) registeredCommands.set(registeredGlobalCommand.id, registeredGlobalCommand);
      }
      if ((!type || type === 'guilds') && cmd.guilds?.length) {
        // eslint-disable-next-line no-await-in-loop
        let guilds = await this.client.guilds.fetch();
        for (let guild of guilds.entries()) {
          if (guild.available) {
            // eslint-disable-next-line no-await-in-loop
            registeredGuildCommand = await this.register(cmd, guild);
          } else {
            this.client.emit('debug', `Guild unavailable, unable to synchronize commands in: ${guild.id}`);
          }
          if (registeredGuildCommand) registeredCommands.set(registeredGuildCommand.id, registeredGuildCommand);
        }
      }
    }
    return registeredCommands;
  }

  async register(command, guild) {
    if ((guild && !command.guilds?.length) || (!guild && command.guilds?.length)) return null;
    
    let appCommand = await this.findAppCommand(command.name, guild?.id);
    let storedCommandData = this.client.database?.commands && 
      await this.client.database.getCommand(command.name, guild?.id);

    if (!appCommand && storedCommandData) {
      appCommand = await this.client.application.commands.fetch(storedCommandData.id, guild?.id);
    }

    let postedCommand;
    if (!appCommand || appCommand && !Util.hasData(command, appCommand)) {
      postedCommand = appCommand
        ? await appCommand.edit(command.data)
        : await this.client.application.commands.create(command.data, guild?.id);
    }
    const registeredCommand = postedCommand ?? appCommand;
    if (postedCommand || appCommand && !command.ids.has(appCommand.id)) {
      command.ids.set(registeredCommand.id, { 
        id: registeredCommand.id,
        guildId: registeredCommand.guild && registeredCommand.guildId
      });
      if (this.client.database?.commands && !Util.hasData(registeredCommand, storedCommandData)) {
        await this.client.database.setCommand(registeredCommand);
      }
    }
    return registeredCommand;
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
        registryCommand.requiredPerms
        this.cache.set(cacheCommand.id, cacheCommand);
        if (this.client.database?.commands) {
          await this.client.database.setCommand(cacheCommand);
        }
      }
    }
    return cacheCommand;
  }

  async deleteInvalidCommands(type) {
    const results = new Collection();
    let appCommands = new Collection();
    if (!type || type === 'global') {
      const globalAppCommands = await this.client.applications.commands.fetch();
      if (globalAppCommands.size) appCommands = new Collection(globalAppCommands);
    }
    if (!type || type === 'guilds') {
      let guilds = await this.client.guilds.fetch();
      if (guilds.size) {
        const guildAppCommands = await Promise.all(
          guilds.map(guild => {
            if (guild.available) return guild.commands.fetch();
            this.client.emit('debug', `Guild unavailable, unable to delete commands in: "${guild.id}`);
          })
        );
        if (guildAppCommands.length) {
          appCommands = new Collection(appCommands, ...guildAppCommands);
        }
      }
    }
    if (appCommands.size) {
      const deletedCommands = await Promise.all(appCommands.map(cmd => this.deleteInvalid(cmd)));
      if (deletedCommands.length) {
        deletedCommands.map(cmd => results.set(cmd.id, cmd));
      }
    }
    return results;
  }

  async deleteInvalid(appCommand) {
    let deletedCommand;
    const command = this.cache.find(cmd => cmd.ids.has(appCommand.id));
    const location = command.locations.find(loc => loc.id === appCommand.id);
    switch (true) {
      case !command || !location:
      case appCommand.guild && appCommand.guildId !== location.guildId:
      case appCommand.guild && location.guildId === 'global':
      case !appCommand.guild && location.guildId !== 'global': {
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

  async delete(appCommand) {
    const command = this.cache.find(cmd => cmd.ids?.has(appCommand));
    if (command) command.ids.delete(appCommand.id);
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
