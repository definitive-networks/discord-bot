'use strict';

const { PrismaClient } = require('@prisma/client');

class DatabaseManager {
  constructor(client) {
    this.client = client;
    this.prisma = new PrismaClient();
    this.users = this.prisma.user;
    this.guilds = this.prisma.guild;
    this.commands = this.prisma.command;
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

  getCommand(guild_id = 'global') {
    let cmdEntry = await this.commands.findUnique({})
    let commandDB = this.commands.get(guild_id);
    if (!commandDB) {
      this.commands.set(guild_id, false);
      commandDB = this.commands.get(guild_id);
    }
    return commandDB;
  }
}

module.exports = DatabaseManager;
