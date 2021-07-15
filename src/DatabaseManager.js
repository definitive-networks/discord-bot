'use strict';
const db = require('quick.db');

class DatabaseManager {
  constructor(client, tables) {
    this.client = client;
    this.users = new db.table('users');
    this.guilds = new db.table('guilds');
    this.commands = new db.table('commands');
    if (tables && tables.length) {
      tables.map(tableName => {
        this[tableName] = new db.table(tableName);
        return this[tableName];
      });
    }
  }

  getUser(user_id) {
    let userDB = this.users.get(user_id);
    if (!userDB) {
      this.users.set(user_id, false);
      userDB = this.users.get(user_id);
    }
    return userDB;
  }

  getGuild(guild_id) {
    let guildDB = this.guilds.get(guild_id);
    if (!guildDB) {
      this.guilds.set(guild_id, {
        prefix: this.client.config.defaultPrefix,
      });
      guildDB = this.guilds.get(guild_id);
    }
    return guildDB;
  }

  getCommand(guild_id = 'global') {
    let commandDB = this.commands.get(guild_id);
    if (!commandDB) {
      this.commands.set(guild_id, false);
      commandDB = this.commands.get(guild_id);
    }
    return commandDB;
  }
}

module.exports = DatabaseManager;
