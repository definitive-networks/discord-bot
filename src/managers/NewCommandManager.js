'use strict';

const { BaseManager } = require('discord.js');

class CommandManager extends BaseManager {
  constructor(client) {
    super(client);

    this.api = client.application.commands;

    this.cache = new Collection();
  }

  registerCommand(command) {

  }

  registerCommands(commands) {

  }

  registerCommandsIn(directory) {

  }

  async syncGlobalCommands(opts = { deleteInvalid: true }) {

  }

  async syncGuildCommands(guildId, opts = { deleteInvalid: true }) {
    const appCommands = await this.api.fetch({ guildId });
    const handledCommands = [];
    const updatedCommands = [];
    const removedCommands = [];

    for (const appCommand of appCommands) {
      const command = this.cache.find(
        cmd => !!(cmd.inGuild(guildId) && cmd.name === appCommand.name && cmd.type === appCommand.type),
      );
      if (command) {
        command.ids.set(guildId, appCommand.id);
        updatedCommands.push({
          id: appCommand.id,
          ...command.toJSON(),
        });
        handledCommands.push(command.keyName);
      } else if (opts?.deleteInvalid) {
        let removedCommand = await appCommand.delete();
        if (removedCommand) removedCommands.push(removedCommand);
      } else {
        updatedCommands.push(appCommand);
      }
    }
  }

  async syncCommandPermissions() {

  }

  async syncCommands(opts) {
    const options = Object.assign(
      {
        deleteInvalid: true,
        syncGuilds: true,
        syncPermissions: true,
      },
      opts,
    );
    
    let syncedGlobalCommands = await this.syncGlobalCommands(options);
    let syncedGuildCommands = [];
    let syncedCommands;

    if (options.syncGuilds) {
      let guildIds = [];
      for (const command of this.cache.entries()) {
        if (command.guildIds?.length) guildIds = [...new Set(command.guildIds)];
      }
      for (const guildId of guildIds) {
        // eslint-disable-next-line no-await-in-loop
        let result = await this.syncGuildCommands(guildId, options);
        if (result) syncedGuildCommands.push(result); 
      }
    }

    if (options.syncPermissions) {
      try {
        syncedCommands = await this.syncCommandPermissions();
      } catch (err) {
        this.client.emit('error', err);
      }
    }

    return syncedCommands ?? [...syncedGlobalCommands, ...syncedGuildCommands];
  }
}
