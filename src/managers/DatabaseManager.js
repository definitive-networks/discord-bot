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

  async getUser(userId, createUnknown = false) {
    let entry = await this.users.findUnique({
      where: {
        id: userId,
      },
    });
    if (!entry && createUnknown) {
      entry = await this.users.create({
        data: {
          id: userId,
        },
      });
    }
    return entry;
  }

  async getGuild(guildId, createUnknown = false) {
    let entry = await this.guilds.findUnique({
      where: {
        id: guildId,
      },
    });
    if (!entry && createUnknown) {
      entry = await this.guilds.create({
        data: {
          id: guildId,
        },
      });
    }
    return entry;
  }

  async setCommand(data) {
    const commandData = {
      guildId: data.guild ? data.guildId : 'global',
      name: data.name,
      enabled: data.defaultPermission,
    };
    const entry = await this.commands.upsert({
      where: { id: data.id },
      update: commandData,
      create: commandData,
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
      },
      select: {
        permissions: true,
      },
    });
    return entry?.permissions && JSON.parse(entry.permissions);
  }
}

module.exports = DatabaseManager;
