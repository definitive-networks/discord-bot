'use strict';

const { stripIndent } = require('common-tags');
const { BaseManager, Collection } = require('discord.js');
const isEqual = require('lodash.isequal');
const Command = require('../Command');
const { description } = require('../commands/commands');
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
      throw new Error(stripIndent`
        Invalid command object was provided: ${command.name && `('${command.name}' command)`}
          ${validator.error.details.map(detail => `${detail.message}\n`)}
      `);
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
          stripIndent`
            Invalid command object was provided: ${command.name && `('${command.name}' command)`}
              ${validator.error.details.map(detail => `${detail.message}\n`)}
          `,
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
        this.client.emit('debug', `Found existing ${appCommand.type} command: ${appCommand.name} (${appCommand.id})`);
      } else if (opts?.deleteInvalid) {
        // eslint-disable-next-line no-await-in-loop
        let deletedCommand = await appCommand.delete();
        if (deletedCommand) {
          deletedCommands.set(deletedCommand.id, deletedCommand);
          this.client.emit(
            'debug',
            `Deleted unknown ${deletedCommand.type} command: ${deletedCommand.name} (${deletedCommand.id})`,
          );
        }
      } else {
        updatePayload.push(appCommand);
      }
    }

    const unhandledCommands = this.registry.filter(cmd => !cmd.guildIds && !handledCommands.includes(cmd.keyName));

    for (const [, command] of unhandledCommands) {
      updatePayload.push({ ...command.toJSON() });
    }

    const commandsPayload = appCommands.map(cmd => cmd);

    let updatedCommands = new Collection();
    if (!isEqual(updatePayload, commandsPayload)) {
      updatedCommands = await this.api.set(updatePayload);
      const newCommands = updatedCommands.filter(newCmd => !appCommands.find(cmd => cmd.id === newCmd.id));
      for (const [, newCommand] of newCommands) {
        const command = unhandledCommands.find(cmd => cmd.name === newCommand.name);
        if (command) {
          command.ids.set('global', newCommand.id);
          this.client.emit('debug', `Created new ${newCommand.type} command: ${newCommand.name} (${newCommand.id})`);
        }
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
        cmd =>
          !!(
            cmd.guildIds?.length &&
            cmd.guildIds.includes(guildId) &&
            cmd.name === appCommand.name &&
            cmd.type === appCommand.type
          ),
      );
      if (command) {
        command.ids.set(guildId, appCommand.id);
        updatePayload.push({
          id: appCommand.id,
          ...command.toJSON(guildId),
        });
        handledCommands.push(command.keyName);
        this.client.emit('debug', `Found existing ${appCommand.type} command: ${appCommand.name} (${appCommand.id})`);
      } else if (opts?.deleteInvalid) {
        // eslint-disable-next-line no-await-in-loop
        let deletedCommand = await appCommand.delete();
        if (deletedCommand) {
          deletedCommands.set(deletedCommand.id, deletedCommand);
          this.client.emit(
            'debug',
            `Deleted unknown ${deletedCommand.type} command: ${deletedCommand.name} (${deletedCommand.id})`,
          );
        }
      } else {
        updatePayload.push(appCommand);
      }
    }

    const unhandledCommands = this.registry.filter(
      cmd => !!(cmd.guildIds && cmd.guildIds.includes(guildId) && !handledCommands.includes(cmd.keyName)),
    );

    for (const [, command] of unhandledCommands) {
      updatePayload.push({ ...command.toJSON(guildId) });
    }

    const commandsPayload = appCommands.map(cmd => ({
      id: cmd.id,
      name: cmd.name,
      description: cmd.description,
      type: cmd.type,
      ...(cmd.options?.length && { options: cmd.options }),
      defaultPermission: cmd.defaultPermission,
    }));
    console.log(updatePayload, commandsPayload);

    let updatedCommands = new Collection();
    if (!isEqual(updatePayload, commandsPayload)) {
      updatedCommands = await this.api.set(updatePayload, guildId);
      const newCommands = updatedCommands.filter(newCmd => !appCommands.find(cmd => cmd.id === newCmd.id));
      for (const [, newCommand] of newCommands) {
        const command = unhandledCommands.find(cmd => cmd.name === newCommand.name);
        if (command) {
          command.ids.set(guildId, newCommand.id);
          this.client.emit('debug', `Created new ${newCommand.type} command: ${newCommand.name} (${newCommand.type})`);
        }
      }
    }

    return {
      updated: updatedCommands,
      deleted: deletedCommands,
    };
  }

  async syncPermissions() {
    const permissionPayloads = [];

    for (const [, command] of this.registry) {

      if (command.permissions) {
        for (const guildId in command.permissions) {
          const filteredPerms = command.permissions[guildId].filter(perm => perm.type !== 'CHANNEL');
          if (!filteredPerms.length) continue;
          const commandId = command.ids.get(guildId) || command.ids.get('global');
          if (!commandId) continue;
          if (!(guildId in permissionPayloads)) permissionPayloads[guildId] = [];
          permissionPayloads[guildId].push({
            id: commandId,
            permissions: filteredPerms,
          });
        }
      } else {
        const guilds = await this.client.guilds.fetch();
        for (const [guildId, commandId] of command.ids) {
          permissionPayloads[guildId].push({
            id: commandId,
            permissions: [],
          });
        }
      }
    }

    let syncedPermissions;
    for (const guildId in permissionPayloads) {
      // eslint-disable-next-line no-await-in-loop
      syncedPermissions = await this.api.permissions.set({
        ...(guildId !== 'global' && { guild: guildId }),
        fullPermissions: permissionPayloads[guildId],
      });
      this.client.emit('debug', `Synced permissions for commands in: ${guildId}`);
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
    //
    let syncedCommands = [];
    const guildIds = new Set(['global']);
    if (options.syncGuilds) {
      for (const [, command] of this.registry) {
        if (command.guildIds?.length) command.guildIds.forEach(guildId => guildIds.add(guildId));
      }
    }
    let guilds;
    if (options.syncPermissions) guilds = await this.client.guilds.fetch();
    for (const guildId of guildIds) {
      // eslint-disable-next-line no-await-in-loop
      const guild = guildId !== 'global' && (await this.client.guilds.fetch(guildId));
      if (guildId !== 'global' && !guild?.available) {
        this.client.emit('warn', `Guild unavailable, unable to post commands in : ${guildId}`);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const appCommands = await this.api.fetch(guildId !== 'global' && { guildId });
      const handledCommands = [];
      const deletedCommands = new Collection();
      const updatePayload = [];
      const permissionsPayload = {};

      for (const [, appCommand] of appCommands) {
        if (options.syncPermissions) {
          if (!permissionsPayload[guildId]) permissionsPayload[guildId] = {};
          if (!permissionsPayload[guildId][appCommand.id]) permissionsPayload[guildId][appCommand.id] = [];
        }
        const command = this.registry.find(
          cmd =>
            !!(
              ((cmd.guildIds?.length && cmd.guildIds.includes(guildId)) ||
                (guildId === 'global' && !cmd.guildIds?.length)) &&
              cmd.name === appCommand.name &&
              cmd.type === appCommand.type
            ),
        );
        if (command) {
          command.ids.set(guildId, appCommand.id);
          updatePayload.push({
            id: appCommand.id,
            ...command.toJSON(guildId !== 'global' && guildId),
          });
          handledCommands.push(command.keyName);
          this.client.emit('debug', `Found existing ${appCommand.type} command: ${appCommand.name} (${appCommand.id})`);
          if (!options.syncPermissions) continue;
          if (guildId === 'global' && guilds.size) {
            guilds.forEach(async guld => {
              const cmdGuildPerms = await appCommand.permissions.fetch({ guild: guld });
              if (!cmdGuildPerms.length) return;
              if (!permissionsPayload[guld]) permissionsPayload[guld] = {};
              if (!permissionsPayload[guld][appCommand.id]) permissionsPayload[guld][appCommand.id] = [];
              permissionsPayload[guld][appCommand.id].push(...cmdGuildPerms);
            });
            continue;
          }
          // eslint-disable-next-line no-await-in-loop
          const cmdGuildPerms = await appCommand.permissions.fetch({ guild: guildId });
          if (!cmdGuildPerms.length) continue;
          if (!permissionsPayload[guildId])
          permissionsPayload[appCommand.id][guildId].push(...cmdGuildPerms);
        } else if (options.deleteInvalid) {
          // eslint-disable-next-line no-await-in-loop
          let deletedCommand = await appCommand.delete();
          if (deletedCommand) {
            deletedCommands.set(deletedCommand.id, deletedCommand);
            this.client.emit(
              'debug',
              `Deleted unknown ${deletedCommand.type} command: ${deletedCommand.name} (${deletedCommand.id})`,
            );
          }
        } else {
          updatePayload.push(appCommand);
        }
      }

      const unhandledCommands = this.registry.filter(
        cmd =>
          !!(
            ((cmd.guildIds?.length && cmd.guildIds.includes(guildId)) ||
              (guildId === 'global' && !cmd.guildIds?.length)) &&
            !handledCommands.includes(cmd.keyName)
          ),
      );

      for (const [, command] of unhandledCommands) {
        updatePayload.push({ ...command.toJSON(guildId !== 'global' && guildId) });
      }

      const commandsPayload = appCommands.map(cmd => ({
        id: cmd.id,
        name: cmd.name,
        description: cmd.description,
        type: cmd.type,
        ...(cmd.options?.length && { options: cmd.options }),
        defaultPermission: cmd.defaultPermission,
      }));
      console.log(updatePayload, commandsPayload);

      let updatedCommands = new Collection();
      if (!isEqual(updatePayload, commandsPayload)) {
        // eslint-disable-next-line no-await-in-loop
        updatedCommands = await this.api.set(updatePayload, guildId !== 'global' && guildId);
        const newCommands = updatedCommands.filter(newCmd => !appCommands.find(cmd => cmd.id === newCmd.id));
        for (const [, newCommand] of newCommands) {
          const command = unhandledCommands.find(cmd => cmd.name === newCommand.name && cmd.type === newCommand.type);
          if (command) {
            command.ids.set(guildId, newCommand.id);
            this.client.emit(
              'debug',
              `Created new ${newCommand.type} command: ${newCommand.name} (${newCommand.type})`,
            );
            if (!options.syncPermissions) continue;
            if (guildId === 'global' && guilds.size) {
              guilds.forEach(guld => {
                if (!permissionsPayload[guld]) permissionsPayload[guld] = {};
                if (!permissionsPayload[guld][newCommand.id]) permissionsPayload[guld][newCommand.id] = [];
                permissionsPayload[guld][newCommand.id].push({
                  ...command.permissions[guildId],
                });
              });
              continue;
            }
            if (!permissionsPayload[guildId]) permissionsPayload[guildId] = {};
            if (!permissionsPayload[guildId][newCommand.id]) permissionsPayload[guildId][newCommand.id] = [];
            permissionsPayload[guildId][newCommand.id].push({
              ...command.permissions[guildId],
            });
          }
        }
      }

      for (const permsGuildId in permissionsPayload) {
        for (const commandId in permissionsPayload[permsGuildId]) {
          
          await this.api.permissions.set({ 
            guild: permsGuildId,
            fullPermission: permissionsPayload[permsGuildId][commandId],
          });
          permissionsPayload[permsGUildId][commandId]
        }
        permissionsPayload[guildId].forEach(perm => {
          
        });
        permissionsPayload[permsGuildId].filter(perm => perm.commandId )
        await this.api.permissions.set({ guild: permsGuildId, fullPermissions: })
      }
      // eslint-disable-next-line no-unused-vars
      permissionsPayload[guildId].map(({ id: _, ...permObj }) => permObj);

      syncedCommands.push({
        location: guildId,
        updated: updatedCommands,
        deleted: deletedCommands,
      });
    }
    //
    if (options.syncGuilds) {
      let guildIds = new Set();
      for (const [, command] of this.registry) {
        if (command.guildIds?.length) command.guildIds.forEach(guildId => guildIds.add(guildId));
      }
      for (const guildId of guildIds) {
        // eslint-disable-next-line no-await-in-loop
        const guild = await this.client.guilds.fetch(guildId);
        if (guild?.available) {
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
      updatedCommands: new Collection(syncedGlobalCommands.updated, syncedGuildCommands.updated),
      deletedCommands: new Collection(syncedGlobalCommands.deleted, syncedGuildCommands.deleted),
      permissions: syncedPermissions,
    };
  }

  getFromInteraction(interaction) {
    if (interaction.inGuild()) {
      return this.registry.find(
        cmd =>
          !!(
            cmd.guildIds?.length &&
            cmd.guildIds.includes(interaction.guildId) &&
            cmd.name === interaction.commandName &&
            cmd.type === interaction.command.type
          ),
      );
    } else {
      return this.registry.get(`${interaction.command.type}:global:${interaction.commandName}`);
    }
  }
}

module.exports = CommandManager;
