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
    const deletedCommands = new Collection();
    const updatedCommands = new Collection();
    const handledCommands = [];
    const updatePayload = [];
    const deletedAppCommands = new Collection();

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
          deletedAppCommands.set(deletedCommand.id, deletedCommand);
          this.client.emit(
            'debug',
            `Deleted unknown ${deletedCommand.type} command: ${deletedCommand.name} (${deletedCommand.id})`,
          );
        }
      } else {
        updatePayload.push(appCommand);
      }
    }

    if (deletedAppCommands.size) deletedCommands.set('global', deletedAppCommands);

    const unhandledCommands = this.registry.filter(cmd => !cmd.guildIds && !handledCommands.includes(cmd.keyName));

    for (const [, command] of unhandledCommands) {
      updatePayload.push({ ...command.toJSON() });
    }

    const commandsPayload = appCommands.map(cmd => ({
      id: cmd.id,
      name: cmd.name,
      description: cmd.description,
      type: cmd.type,
      ...(cmd.options?.length && { options: cmd.options }),
      defaultPermission: cmd.defaultPermission,
    }));

    if (!isEqual(updatePayload, commandsPayload)) {
      const updatedAppCommands = await this.api.set(updatePayload);
      if (updatedAppCommands?.size) updatedCommands.set('global', updatedAppCommands);
      const nuCommands = updatedAppCommands.filter(nuCmd => !appCommands.find(cmd => cmd.id === nuCmd.id));
      for (const [, nuCommand] of nuCommands) {
        const command = unhandledCommands.find(cmd => cmd.name === nuCommand.name && cmd.type === nuCommand.type);
        if (command) {
          command.ids.set('global', nuCommand.id);
          this.client.emit('debug', `Created new ${nuCommand.type} command: ${nuCommand.name} (${nuCommand.id})`);
        }
      }
    }

    return {
      updated: updatedCommands,
      deleted: deletedCommands,
    };
  }

  async syncGuild(guildId = 'all', opts = { deleteInvalid: true }) {
    if (!guildId) return null;
    const guildIds = new Set();
    const deletedCommands = new Collection();
    const updatedCommands = new Collection();

    if (guildId === 'all') {
      const guilds = await this.client.guilds.fetch();
      if (guilds.size) guilds.forEach(guild => guildIds.add(guild.id));
    } else {
      guildIds.add(opts.guildId);
    }

    for (const gid of guildIds) {
      // eslint-disable-next-line no-await-in-loop
      const guild = await this.client.guilds.fetch(gid);
      if (!guild?.available) {
        this.client.emit('warn', `Guild unavailable, unable to post commands in : ${gid}`);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const appCommands = await this.api.fetch({ guildId: guild.id });
      const handledCommands = [];
      const updatePayload = [];
      const deletedAppCommands = new Collection();

      for (const [, appCommand] of appCommands) {
        const command = this.registry.find(
          cmd =>
            !!(
              cmd.guildIds?.length &&
              (cmd.guildIds.includes(guild.id) || cmd.guildIds.includes('all')) &&
              cmd.name === appCommand.name &&
              cmd.type === appCommand.type
            ),
        );
        if (command) {
          command.ids.set(guild.id, appCommand.id);
          updatePayload.push({
            id: appCommand.id,
            ...command.toJSON(guild.id),
          });
          handledCommands.push(command.keyName);
          this.client.emit('debug', `Found existing ${appCommand.type} command: ${appCommand.name} (${appCommand.id})`);
        } else if (opts?.deleteInvalid) {
          // eslint-disable-next-line no-await-in-loop
          let deletedCommand = await appCommand.delete();
          if (deletedCommand) {
            deletedAppCommands.set(deletedCommand.id, deletedCommand);
            this.client.emit(
              'debug',
              `Deleted unknown ${deletedCommand.type} command: ${deletedCommand.name} (${deletedCommand.id})`,
            );
          }
        } else {
          updatePayload.push(appCommand);
        }
      }

      if (deletedAppCommands.size) deletedCommands.set(guild.id, deletedAppCommands);

      const unhandledCommands = this.registry.filter(
        cmd =>
          !!(
            cmd.guildIds?.length &&
            (cmd.guildIds.includes(guild.id) || cmd.guildIds.includes('all')) &&
            !handledCommands.includes(cmd.keyName)
          ),
      );

      for (const [, command] of unhandledCommands) {
        updatePayload.push({ ...command.toJSON(guild.id) });
      }

      const commandsPayload = appCommands.map(cmd => ({
        id: cmd.id,
        name: cmd.name,
        description: cmd.description,
        type: cmd.type,
        ...(cmd.options?.length && { options: cmd.options }),
        defaultPermission: cmd.defaultPermission,
      }));
      if (!isEqual(updatePayload, commandsPayload)) {
        // eslint-disable-next-line no-await-in-loop
        const updatedAppCommands = await this.api.set(updatePayload, guild.id);
        if (updatedAppCommands?.size) updatedCommands.set(guild.id, updatedAppCommands);
        const nuCommands = updatedAppCommands.filter(nuCmd => !appCommands.find(cmd => cmd.id === nuCmd.id));
        for (const [, nuCommand] of nuCommands) {
          const command = unhandledCommands.find(cmd => cmd.name === nuCommand.name && cmd.type === nuCommand.type);
          if (command) {
            command.ids.set(guild.id, nuCommand.id);
            this.client.emit('debug', `Created new ${nuCommand.type} command: ${nuCommand.name} (${nuCommand.id})`);
          }
        }
      }
    }

    return {
      updated: updatedCommands,
      deleted: deletedCommands,
    };
  }

  async syncPermissions(guildId = 'all', opts = { syncDatabase: true }) {
    if (!guildId) return null;
    const permissionPayloads = [];
    for (const [, command] of this.registry) {
      for (const [gid, cid] of command.ids) {
        if ((guildId !== 'all' && gid !== guildId) || gid === 'global') continue;
        if (!permissionPayloads[gid]) permissionPayloads[gid] = [];
        let updatePayload;
        if (opts?.syncDatabase && this.client.database) {
          updatePayload = this.client.database.getCommandPermissions(gid, cid);
        }
        if (updatePayload?.length || (command.permissions && command.permissions[gid]?.length)) {
          updatePayload = (updatePayload?.length && updatePayload) || command.permissions[gid];
        }
        if (updatePayload?.length) command.permissions[gid] = updatePayload;
        permissionPayloads[gid].push({
          id: cid,
          permissions: (updatePayload?.length && updatePayload.filter(perm => perm.type !== 'CHANNEL')) || [],
        });
      }
    }

    let syncedPermissions;
    for (const permGuildId in permissionPayloads) {
      // eslint-disable-next-line no-await-in-loop
      let currentGuildPerms = (await this.api.permissions.fetch({ guild: permGuildId })) || {};
      if (currentGuildPerms?.constructor?.name === 'Collection') {
        currentGuildPerms = Object.fromEntries(currentGuildPerms);
      }
      if (
        (!Object.keys(currentGuildPerms)?.length &&
          permissionPayloads[permGuildId].every(cmd => !cmd.permissions.length)) ||
        isEqual(currentGuildPerms, permissionPayloads[permGuildId])
      ) {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      syncedPermissions = await this.api.permissions.set({
        guild: permGuildId,
        fullPermissions: permissionPayloads[permGuildId],
      });
      this.client.emit('debug', `Synced permissions for commands in: ${permGuildId}`);
    }
    return syncedPermissions;
  }

  async sync(opts) {
    const options = Object.assign(
      {
        deleteInvalid: true,
        syncDatabase: true,
        syncGlobal: true,
        syncGuilds: true,
        syncPermissions: true,
      },
      opts,
    );

    let syncedGlobalCommands, syncedGuildCommands, syncedPermissions;
    try {
      if (options.syncGlobal) {
        syncedGlobalCommands = await this.syncGlobal(options);
      }
      if (options.syncGuilds) {
        syncedGuildCommands = await this.syncGuild('all', options);
      }
      if (options.syncPermissions) {
        syncedPermissions = await this.syncPermissions('all', options);
      }
    } catch (err) {
      this.client.emit('error', err);
    }

    return {
      updatedCommands: new Collection(
        syncedGlobalCommands?.updated?.size ? syncedGlobalCommands.updated : '',
        syncedGuildCommands?.updated?.size ? syncedGuildCommands.updated : '',
      ),
      deletedCommands: new Collection(
        syncedGlobalCommands?.deleted?.size ? syncedGlobalCommands.deleted : '',
        syncedGuildCommands?.deleted?.size ? syncedGuildCommands.deleted : '',
      ),
      permissions: syncedPermissions,
    };
  }

  getFromInteraction(interaction) {
    if (interaction.inGuild()) {
      return this.registry.find(
        cmd =>
          !!(
            ((cmd.ids.get(interaction.guildId) || cmd.ids.get('global')) === interaction.commandId ||
              (cmd.guildIds?.length && (cmd.guildIds.includes(interaction.guildId) || cmd.guildIds.includes('all'))) ||
              !cmd.guildIds) &&
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
