'use strict';

class Command {
  constructor(client, data) {
    this.client = client;
    this.type = data.type ?? 'CHAT_INPUT';
    this.name = data.name;
    this.description =
      this.type !== 'CHAT_INPUT'
        ? ''
        : data.description.toString() ?? `${data.name.charAt(0).toUpperCase() + data.name.slice(1)} Command`;
    this.defaultPermission = data.defaultPermission ?? true;
    
  }
}

class BotCommand {
  constructor(client, data, appData) {
    this.client = client;
    this.name = data.name;
    this.description =
      data.type && data.type !== 'CHAT_INPUT'
        ? data.description ?? ''
        : data.description ?? `${data.name.charAt(0).toUpperCase() + data.name.slice(1)} Command`;
    this.type = (appData ?? data).type;
    this.args = data.args && typeof data.args === 'function' ? data.args(client) : data.args;
    this.defaultPermission = (appData ?? data).defaultPermission;
    this.permissions = (appData ?? data).permissions;
    this.requiredPerms = data.requiredPerms;
    this.execute = data.execute;

    if (!appData) {
      this.guilds = data.guilds ?? ['global'];
    } else {
      this.id = appData.id;
      this.guild = appData.guild;
      this.guildId = appData.guild ? appData.guildId : 'global'; 
      this.manager = appData.manager;
      this.permissions = appData.permissions ?? data.permissions;
    }
  }

  get data() {
    return {
      name: this.name,
      description: this.description,
      type: this.type,
      options: this.args,
      defaultPermission: this.defaultPermission,
    };
  }
}
