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
  }

  create(data) {
    return Validator.isCommand(data) && this.cache.set(data.name, new Command(this.client, data));
  }

  async respond(interaction) {
    const command = interaction.commandId && this.cache.find(cmd => cmd.ids.has(interaction.commandId));
    if (!command) return;
    if (interaction.user.bot && interaction.user.id !== this.client.user.id) return;
    if (interaction.guild && !interaction.guild.available) return;
    await command.execute(interaction, interaction.options, this.client);
  }

  async registerCommand(command) {
    
  }

  async registerCommands(commands) {
    const result = new Collection();
    if (commands.size) {
      for (const command of commands) {
        if (!Validator.isCommand(command)) continue;
        // eslint-disable-next-line no-await-in-loop
        let registeredCommand = await this.registerCommand(command);
        if (registeredCommand) result.set(registeredCommand.id, registeredCommand); 
      }
    }
    return result.size ? result : null;
    //
    let appGlobalCommands = await this.registerGlobalCommands();
    let appGuildCommands = await this.registerGuildCommands();
    const registeredCommands = new Collection(appGlobalCommands, appGuildCommands);
    return registeredCommands;
  }

  async registerCommandsIn(options) {

    return this.registerCommands(commands);
  }

  async registerGlobalCommands() {
    const registeredGlobalCommands = new Collection();
    const globalCommands = this.cache.filter(cmd => cmd.isGlobal);
    for (const cmd of globalCommands.entries()) {
      // eslint-disable-next-line no-await-in-loop
      let appCommand = await this.register(cmd);
      if (appCommand) registeredGlobalCommands.set(appCommand.id, appCommand);
    }
    return registeredGlobalCommands;
  }

  async registerGuildCommands() {
    let guilds = await this.client.guilds.fetch();
    const registeredGuildCommands = new Collection();
    const guildCommands = this.cache.filter(cmd => !cmd.isGlobal);
    for (const cmd of guildCommands.entries()) {
      for (const guild of guilds.filter(g => cmd.guilds.includes(g.id)).entries()) {
        if (guild.available) {
          // eslint-disable-next-line no-await-in-loop
          const appCommand = await this.register(cmd, guild);
          if (appCommand) registeredGuildCommands.set(appCommand.id, appCommand);
        } else {
          this.client.emit('debug', `Guild unavailable, sync failed for "${cmd.name}" command in: ${guild.id}`);
        }
      }
    }
    return registeredGuildCommands;
  }

  async register(command, guild) {
    if ((guild && !command.guilds?.length) || (!guild && command.guilds?.length)) return null;

    let appCommand = await this.findAppCommand(command.name, guild?.id);
    let storedCommandData =
      this.client.database?.commands && (await this.client.database.getCommand(command.name, guild?.id));

    if (!appCommand && storedCommandData) {
      appCommand = await this.client.application.commands.fetch(storedCommandData.id, guild?.id);
    }

    let postedCommand;
    if (!appCommand || (appCommand && !Util.hasData(command, appCommand))) {
      postedCommand = appCommand
        ? await appCommand.edit(command.data)
        : await this.client.application.commands.create(command.data, guild?.id);
    }
    const registeredCommand = postedCommand ?? appCommand;
    if (postedCommand || (appCommand && !command.ids.has(appCommand.id))) {
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

  async deleteAll(opts = {}) {
    let deletedGlobalCommands = await this.deleteGlobal(opts);
    let deletedGuildCommands = await this.deleteGuilds(opts);
    const deletedCommands = new Collection(deletedGlobalCommands, deletedGuildCommands);
    return deletedCommands;
  }

  async deleteGlobal(opts = {}) {
    const deletedGlobalCommands = new Collection();
    const appGlobalCommands = await this.client.application.commands.fetch();
    for (const appCommand of appGlobalCommands.entries()) {
      let deletedCommand;
      if (opts?.invalidOnly) {
        // eslint-disable-next-line no-await-in-loop
        deletedCommand = await this.deleteInvalidCommand(appCommand);
      } else {
        // eslint-disable-next-line no-await-in-loop
        deletedCommand = await this.unregister(appCommand);
      }
      if (deletedCommand) deletedGlobalCommands.set(deletedCommand.id, deletedCommand);
    }
    if (!opts?.invalidOnly) await this.client.application.commands.set([]);
    return deletedGlobalCommands;
  }

  async deleteGuilds(opts = {}) {
    let guilds = await this.client.guilds.fetch();
    const deletedGuildCommands = new Collection();
    const appGuildCommands = await Promise.all(
      guilds.map(guild => {
        if (guild.available) return guild.commands.fetch();
        this.client.emit('debug', `Guild unavailable, unable to delete commands in: "${guild.id}`);
        return Promise.resolve();
      }),
    );
    for (const appCommand of appGuildCommands) {
      let deletedCommand;
      if (opts?.invalidOnly) {
        // eslint-disable-next-line no-await-in-loop
        deletedCommand = await this.deleteInvalidCommand(appCommand);
      } else {
        // eslint-disable-next-line no-await-in-loop
        deletedCommand = await this.unregister(appCommand);
      }
      if (deletedCommand) deletedGuildCommands.set(deletedCommand.id, deletedCommand);
      // eslint-disable-next-line no-await-in-loop
      if (!opts?.invalidOnly) await appCommand.guild.commands.set([]);
    }
    return deletedGuildCommands;
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

  async unregister(appCommand) {
    const command = this.cache.find(cmd => cmd.ids?.has(appCommand.id));
    if (command) command.ids.delete(appCommand.id);
    if (this.client.database?.commands) {
      await this.client.database.commands.delete({
        where: {
          id: appCommand.id,
          guildId: appCommand.guild ? appCommand.guildId : 'global',
        },
      });
    }
    return appCommand;
  }

  async delete(appCommand) {
    await this.unregister(appCommand);
    let deletedCommand = await appCommand.delete();
    return deletedCommand;
  }

  async sync() {
    const results = {
      registered: await this.registerCommands(),
      deleted: await this.deleteAll({ invalidOnly: true }),
    };
    return results;
  }
}

module.exports = CommandManager;
