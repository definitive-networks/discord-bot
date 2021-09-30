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
    let entry = await this.users.findUnique({
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
    let entry = await this.guilds.findUnique({
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
    let entry = await this.commands.upsert({
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

  async getCommand(command_name, command_location = 'global') {
    let entry = await this.commands.findUnique({
      where: {
        name: command_name,
        guildId: command_location.toString(),
      },
    });
    return entry;
  }

  async getCommandById(command_id) {
    let entry = await this.commands.findUnique({
      where: {
        id: command_id.toString(),
      },
    });
    return entry;
  }

  async getCommands(guild_id = 'global') {
    let entry = await this.commands.findMany({
      where: {
        guildId: guild_id.toString(),
      },
    });
    return entry;
  }
}

module.exports = DatabaseManager;
