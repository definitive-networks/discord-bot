'use strict';

const { PrismaClient } = require('@prisma/client');

class DatabaseManager extends PrismaClient {
  constructor(client, options) {
    super(options);

    this.manager = client;

    this.$on('error', err => this.manager.emit('error', err));
    this.$on('info', message => this.manager.emit('debug', message));
    this.$on('query', info => this.manager.emit('debug', info));
    this.$on('warn', info => this.manager.emit('warn', info));
  }

  async getUser(user_id, createUnknown = false) {
    const entry = await this.users.findUnique({
      where: {
        id: user_id.toString(),
      },
    });
    if (!entry && createUnknown) {
      entry = await this.users.create({
        data: {
          id: user_id,
        },
      });
    }
    return entry;
  }

  async getGuild(guild_id, createUnknown = false) {
    const entry = await this.guilds.findUnique({
      where: {
        id: guild_id.toString(),
      },
    });
    if (!entry && createUnknown) {
      entry = await this.guilds.create({
        data: {
          id: guild_id,
        },
      });
    }
    return entry;
  }

  async setCommand(command_data) {
    const entry = await this.commands.upsert({
      where: { id: command_data.id },
      update: {
        guildId: command_data.guild ? command_data.guildId : 'global',
        name: command_data.name,
        enabled: command_data.defaultPermission,
      },
      create: {
        guildId: command_data.guild ? command_data.guildId : 'global',
        name: command_data.name,
        enabled: command_data.defaultPermission,
      },
    });
    return entry;
  }

  async getCommand(name, guildId = 'global', type = 'CHAT_INPUT') {
    if (!name) return null;
    const entry = await this.commands.findUnique({
      where: {
        name,
        guildId,
        type,
      },
    });
    return entry;
  }

  async getCommandById(commandId) {
    if (!commandId) return null;
    const entry = await this.commands.findUnique({
      where: {
        id: commandId,
      },
    });
    return entry;
  }

  async getCommands(guildId) {
    const entry = await this.commands.findMany(...(guildId && {
      where: {
        guildId,
      },
    }));
    return entry;
  }

  async getCommandPermissions(guildId, commandId) {
    if (!guildId || !commandId) return null;
    const entry = await this.commands.findUnique({
      where: {
        id: commandId,
        guildId,
      }
    });
    return entry;
  }
}

module.exports = DatabaseManager;
