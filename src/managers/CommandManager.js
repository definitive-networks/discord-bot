'use strict';

const { BaseManager, Collection } = require('discord.js');
const isEqual = require('lodash.isequal');
const Command = require('../Command');
const { Validator } = require('../util');

class CommandManager extends BaseManager {
  constructor(client) {
    super(client);

    this.registry = new Collection();
  }

  get api() {
    return this.client.application.commands;
  }

  register(command) {
    const validator = Validator.isCommand(command);
    if (validator.error) {
      throw new Error(`Invalid command object was provided: ${command}`, validator.error.details);
    }

    command = new Command(this.client, command);

    if (this.registry.some(cmd => cmd.keyName === command.keyName)) {
      throw new Error(`Command is already registered: ${command.name} (${command.keyName})`);
    }

    if (
      command.guildIds &&
      this.registry.some(
        cmd =>
          !!(
            cmd.type === command.type &&
            cmd.name === command.name &&
            cmd.guildIds &&
            cmd.guildIds.map(gid => command.guildIds.includes(gid)).includes(true)
          ),
      )
    ) {
      throw new Error(`Command has conflicting a guild ID: ${command.name}`);
    }

    this.registry.set(command.keyName, command);

    return this.registry;
  }

  registerMany(commands) {
    if (!Array.isArray(commands)) return null;
    for (const command of commands) {
      const validator = Validator.isCommand(command);
      if (validator.error) {
        this.client.emit(
          'warn',
          `Invalid command object was provided: ${command}`,
          validator.error.details.map(detail => detail.message).join(', '),
        );
        continue;
      }
      this.register(command);
    }
    return this.registry;
  }

  registerFrom(directory) {
    const commands = [];
    require('require-all')({
      dirname: directory,
      resolve: data => commands.push(data),
    });
    return this.registerMany(commands);
  }

  async syncGlobal(opts = { deleteInvalid: true }) {
    const appCommands = await this.api.fetch();
    const handledCommands = [];
    const deletedCommands = new Collection();
    const updatePayload = [];

    for (const [, appCommand] of appCommands) {
      const commandKey = `${appCommand.type || 'CHAT_INPUT'}:global:${appCommand.name}`;
      const command = this.registry.get(commandKey);
      if (command) {
        command.ids.set('global', appCommand.id);
        updatePayload.push({
          id: appCommand.id,
          ...command.toJSON(),
        });
        handledCommands.push(commandKey);
      } else if (opts?.deleteInvalid) {
        console.log(appCommand);
        // eslint-disable-next-line no-await-in-loop
        let deletedCommand = await appCommand.delete();
        if (deletedCommand) deletedCommands.set(deletedCommand.id, deletedCommand);
      } else {
        updatePayload.push(appCommand);
      }
    }

    const unhandledCommands = this.registry.filter(cmd => !cmd.guildIds && !handledCommands.includes(cmd.keyName));

    for (const [, command] of unhandledCommands) {
      updatePayload.push({ ...command.toJSON() });
    }

    const commandsPayload = appCommands.map(cmd => cmd);
    // Delete later
    console.log('globalSync', commandsPayload);

    let updatedCommands = new Collection();
    if (!isEqual(updatePayload, commandsPayload)) {
      updatedCommands = await this.api.set(updatePayload);
      const newCommands = updatedCommands.filter(newCmd => !appCommands.find(cmd => cmd.id === newCmd.id));
      for (const newCommand of newCommands) {
        const command = unhandledCommands.find(cmd => cmd.name === newCommand.name);
        if (command) command.ids.set('global', newCommand.id);
      }
    }

    return {
      updated: updatedCommands,
      deleted: deletedCommands,
    };
  }

  async syncGuild(guildId, opts = { deleteInvalid: true }) {
    const appCommands = await this.api.fetch({ guildId });
    const handledCommands = [];
    const deletedCommands = new Collection();
    const updatePayload = [];

    for (const [, appCommand] of appCommands) {
      const command = this.registry.find(
        cmd => !!(cmd.hasGuild(guildId) && cmd.name === appCommand.name && cmd.type === appCommand.type),
      );
      if (command) {
        command.ids.set(guildId, appCommand.id);
        updatePayload.push({
          id: appCommand.id,
          ...command.toJSON(),
        });
        handledCommands.push(command.keyName);
      } else if (opts?.deleteInvalid) {
        // eslint-disable-next-line no-await-in-loop
        let deletedCommand = await appCommand.delete();
        if (deletedCommand) deletedCommands.set(deletedCommand.id, deletedCommand);
      } else {
        updatePayload.push(appCommand);
      }
    }

    const unhandledCommands = this.registry.filter(
      cmd => !!(cmd.guildIds && cmd.guildIds.includes(guildId) && !handledCommands.includes(cmd.keyName)),
    );

    for (const command of unhandledCommands) {
      updatePayload.push({ ...command.toJSON() });
    }

    const commandsPayload = appCommands.map(cmd => cmd);
    // Delete later
    console.log('guildSync', commandsPayload);

    let updatedCommands = new Collection();
    if (!isEqual(updatePayload, commandsPayload)) {
      updatedCommands = await this.api.set(updatePayload, guildId);
      const newCommands = updatedCommands.filter(newCmd => !appCommands.find(cmd => cmd.id === newCmd.id));
      for (const newCommand of newCommands) {
        const command = unhandledCommands.find(cmd => cmd.name === newCommand.name);
        if (command) command.ids.set(guildId, newCommand.id);
      }
    }

    return {
      updated: updatedCommands,
      deleted: deletedCommands,
    };
  }

  async syncPermissions() {
    const guildPayloads = [];

    for (const [, command] of this.registry) {
      if (command.permissions) {
        for (const guildId in command.permissions) {
          const commandId = command.ids.get(guildId) || command.ids.get('global');
          if (!commandId) continue;
          if (!(guildId in guildPayloads)) guildPayloads[guildId] = [];
          guildPayloads[guildId].push({
            id: commandId,
            permissions: command.permissions[guildId],
          });
        }
      }
    }

    let syncedPermissions;
    for (const guildId of guildPayloads) {
      // eslint-disable-next-line no-await-in-loop
      syncedPermissions = await this.api.permissions.set({ guild: guildId, fullPermissions: guildPayloads[guildId] });
    }
    return syncedPermissions;
  }

  async sync(opts) {
    const options = Object.assign(
      {
        deleteInvalid: true,
        syncGuilds: true,
        syncPermissions: true,
      },
      opts,
    );

    let syncedGlobalCommands = await this.syncGlobal(options);
    let syncedGuildCommands = [];

    if (options.syncGuilds) {
      let guildIds = [];
      for (const command of this.registry.entries()) {
        if (command.guildIds?.length) guildIds = [...new Set(command.guildIds)];
      }
      const guilds = await this.client.guilds.fetch(guildIds);
      for (const guildId of guildIds) {
        if (guilds.some(guild => guild.id === guildId && guild.available)) {
          // eslint-disable-next-line no-await-in-loop
          const result = await this.syncGuild(guildId, options);
          if (result) syncedGuildCommands.push(result);
        } else {
          this.client.emit('warn', `Guild unavailable, unable to post commands in: ${guildId}`);
        }
      }
    }

    let syncedPermissions;
    if (options.syncPermissions) {
      try {
        syncedPermissions = await this.syncPermissions();
      } catch (err) {
        this.client.emit('error', err);
      }
    }

    return {
      commands: {
        updated: new Collection(syncedGlobalCommands.updated, syncedGuildCommands.updated),
        deleted: new Collection(syncedGlobalCommands.deleted, syncedGuildCommands.deleted),
      },
      permissions: syncedPermissions,
    };
  }

  getFromInteraction(interaction) {
    return interaction.inGuild()
      ? this.registry.find(
          cmd =>
            !!(
              cmd.guildIds?.length &&
              cmd.guildIds.includes(interaction.guildId) &&
              cmd.name === interaction.commandName &&
              cmd.type === interaction.command.type
            ),
        ) || this.registry.get(`${interaction.command.type}:global:${interaction.commandName}`)
      : this.registry.get(`${interaction.command.type}:global:${interaction.commandName}`);
  }
}

module.exports = CommandManager;
