'use strict';

const { stripIndent } = require('common-tags');
const { BaseManager, Collection, ApplicationCommandManager } = require('discord.js');
const isEqual = require('lodash.isequal');
const Command = require('../structures/Command');
const { Validator } = require('../util');

class CommandManager extends BaseManager {
  constructor(client) {
    super(client);

    this.registry = new Collection();
  }

  get api() {
    return this.client.application.commands;
  }

  register(data = []) {
    if (!Array.isArray(data)) data = [data];
    return data.reduce(
      (coll, command) => {
        const prefix = Array.isArray(command.guildIds)
          ? command.guildIds.join(',')
          : command.guildIds;
        return coll.set(
          `${command.type ?? 'CHAT_INPUT'}:${prefix ?? 'global'}:${command.name}`,
          this._add(command)
        );
      },
      new Collection(),
    );
  }

  _add(data, { keyName } = {}) {
    const existing = this.registry.find(
      cmd =>
        cmd.keyName === keyName ??
        cmd.name === data.name &&
        cmd.type === (data.type || 'CHAT_INPUT') &&
        (
          cmd.isGlobal() && cmd.isGlobal(data) ||
          !cmd.isGlobal() && !cmd.isGlobal(data) && 
          (
            cmd.guildIds.includes('all') ||
            cmd.guildIds.map(gid => data.guildIds?.includes(gid)).includes(true)
          )
        )
    );
    if (existing) {
      existing._patch(data);
      return existing;
    }
    const entry = data.constructor?.name === 'Command' ? data : new Command(this.client, data);
    this.registry.set(keyName ?? entry.keyName, entry);
    return entry;
  }

  _update(data) {

  }

  registerMany(commands) {

    if (!Array.isArray(commands)) return null;
    for (const command of commands) {
      this.register(command);
    }
    return this.registry;
    ////
    const data = await this.register(commands);
    return data.reduce(
      (coll, command) => coll.set(command.keyName, this._add(command)),
      new Collection(),
    );

  }

  registerFrom(directory) {
    const commands = [];
    require('require-all')({
      dirname: directory,
      resolve: data => commands.push(data),
    });
    return this.register(commands);
  }

  registryPath({ id, name, type, guildId } = {}) {
    let path = this.registry;
    if (guildId) {
      path = path.guilds()
    }
    let path = this.registry.find(cmd => cmd.ids.some(cid => cid === id));
    if (name && type && guildId) {
      path = path.
    }

    return id ? this.registry.find() : this.registry;




    this.registry.guilds.get(guildId);
    this.registry.globals.find(cmd => cmd.id === id);
  }

  fetch(id, { name, type, guildId, cache = true, force = false } = {}) {
    if (typeof id === 'object') {
      ({ name, type, guildId, cache = true } = id);
    } else if (id || (guildId && name && type)) {
      if (!force) {
        const existing = this.registry.find(
          cmd => 
            cmd.ids.some(cid => cid === id) ||
            (
              (
                guildId &&
                cmd.name === name &&
                cmd.type === type
              )
              ? cmd.guildIds.includes(guildId)
              : cmd.isGlobal
            )
        );
      }
      const command = await this.registryPath({ id, name, type, guildId }).get();
    }
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
          ...this.constructor.transformCommand(command),
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
      updatePayload.push({ ...this.constructor.transformCommand(command) });
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
            ...this.constructor.transformCommand(command, guild.id),
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
        updatePayload.push({ ...this.constructor.transformCommand(command, guild.id) });
      }

      const commandsPayload = appCommands.map(cmd => ApplicationCommandManager.transformCommand(cmd));
      if (!isEqual(updatePayload, commandsPayload)) {
        //// edit later
        if (commandId && this.registry.some(cmd => cmd.ids.has(commandId))) {
          await this.api.edit(commandId, updatePayload[0], guild.id);
        }
        /////
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

  async syncPermissions(guildId = 'all') {
    if (!guildId) return null;
    const permissionPayloads = [];
    for (const [, command] of this.registry) {
      for (const [gid, cid] of command.ids) {
        if (gid === 'global' || (guildId !== 'all' && gid !== guildId)) continue;
        if (!permissionPayloads[gid]) permissionPayloads[gid] = [];

        const updatePayload = command.permissions && command.permissions[gid]?.length &&
          command.permissions[gid]?.filter( perm => perm.type !== 'CHANNEL');

        permissionPayloads[gid].push({
          id: cid,
          permissions: updatePayload?.length ? updatePayload : [],
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

  static transformCommand(data, guildId) {
    if (data.type === 'CHAT_INPUT') {
      data.options = typeof data.args === 'function' ? data.args(data.client, guildId) : data.args;
    } else {
      data.description = '';
    }
    return ApplicationCommandManager.transformCommand(data);
  }
}

module.exports = CommandManager;
