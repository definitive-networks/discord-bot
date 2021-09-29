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

  async getUser(user_id) {
    let userEntry = await this.users.findUnique({
      where: {
        id: user_id.toString(),
      },
    });
    if (!userEntry) {
      userEntry = await this.users.create({
        data: {
          id: user_id,
        },
      });
    }
    return userEntry;
  }

  async getGuild(guild_id) {
    let guildEntry = await this.guilds.findUnique({
      where: {
        id: guild_id.toString(),
      },
    });
    if (!guildEntry) {
      guildEntry = await this.guilds.create({
        data: {
          id: guild_id,
        },
      });
    }
    return guildEntry;
  }

  async setCommand(command_data) {
    return this.commands.upsert({
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
      }
    });
  }

  async getCommand(command_name, command_location = 'global') {
    return this.commands.findUnique({
      where: {
        name: command_name,
        guildId: command_location.toString(),
      },
    });
  }

  async getCommandById(command_id) {
    return this.commands.findUnique({
      where: {
        id: command_id.toString(),
      },
    });
  }

  async getCommands(guild_id = 'global') {
    return this.commands.findMany({
      where: {
        guildId: guild_id.toString(),
      },
    });
  }
}

module.exports = DatabaseManager;
