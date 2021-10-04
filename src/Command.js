'use strict';

const { oneLine } = require('common-tags');
const { Validator } = require('./util');

class Command {
  constructor(client, data) {
    this.client = client;
    this.manager = client.commands;

    const validator = Validator.isCommand(data);
    if (validator.error) {
      throw new Error(`Invalid command object was provided: ${data}`, validator.error);
    }

    this.type = data.type || 'CHAT_INPUT';
    this.name = data.name;
    if (data.description) this.description = data.description;
    this.args = typeof data.args === 'function' ? data.args(client) : data.args;
    if (data.guildIds) this.guildIds = typeof data.guildIds === 'string' ? [data.guildIds] : data.guildIds;
    this.requiredPermissions = data.requiredPermissions;
    this.throttler = data.throttler;
    this.deferEphemeral = data.deferEphemeral || false;
    this.defaultPermission = typeof data.defaultPermission === 'boolean' ? data.defaultPermission : true;
    if (data.permissions) this.permissions = data.permissions;
    this.execute = data.execute;

    this.ids = new Map();
    this._throttles = new Map();
  }

  get keyName() {
    const prefix = this.guildIds ? this.guildIds.join(',') : 'global';
    return `${this.type}:${prefix}:${this.name}`;
  }

  hasPermission(interaction) {
    if (interaction.inGuild()) {
      if (this.requiredPermissions?.member) {
        if (
          (this.requiredPermissions.member.includes('BOT_OWNER') && !this.client.isOwner(interaction.member.id)) ||
          (this.requiredPermissions.member.includes('GUILD_OWNER') &&
            interaction.member.id !== interaction.guild.ownerId)
        ) {
          return `You're not authorized to use the \`${this.name}\` command.`;
        }
        const missing = interaction.member.permissions.missing(
          this.requiredPermissions.filter(perm => !['BOT_OWNER', 'GUILD_OWNER'].includes(perm)),
        );
        if (missing.length > 0) {
          if (missing.length === 1) {
            return `You're missing the required permission for the \`${this.name}\` command: ${missing[0]}`;
          }
          return oneLine`
            You're missing the required permissions for the \`${this.name}\` command: 
            ${missing.map(perm => perm).join(', ')}
          `;
        }
      }
      if (this.requiredPermissions?.channel) {
        const missing = interaction.channel.permissionsFor(this.client.user).missing(this.requiredPermissions.channel);
        if (missing.length > 0) {
          if (missing.length === 1) {
            return `I'm missing the required permission for the \`${this.name}\` command: ${missing[0]}`;
          }
          return oneLine`
            I'm missing the required permissions for the \`${this.name}\` command:
            ${missing.map(perm => perm).join(', ')}
          `;
        }
      }
    }
    return true;
  }

  async onBlock(interaction, reason, data) {
    switch (reason) {
      case 'permission': {
        if (data.response) await interaction.reply(data.response, { ephemeral: true });
        await interaction.reply(`You do not have permission to use the \`${this.name}\` command.`, { ephemeral: true });
        break;
      }
      case 'throttling': {
        await interaction.reply(
          `You must wait ${data.remaining.toFixed(1)} seconds to use the \`${this.name}\` command again.`, 
          { ephemeral: true },
        );
      }
    }
  }

  async onError(interaction, error) {
    
  }

  // eslint-disable-next-line require-await
  async execute() {
    throw new Error(`${this.name ?? this.constructor.name} doesn't have an execute() method.`);
  }

  throttle(userId) {
    if (!this.throttler) return null;

    let throttle = this._throttles.get(userId);
    if (!throttle) {
      throttle = {
        start: Date.now(),
        usages: 0,
        timeout: setTimeout(() => {
          this._throttles.delete(userId);
        }, this.throttler.duration * 1000)
      };
      this._throttles.set(userId, throttle);
    }
    return throttle;
  }

  toJSON() {
    return this.type === 'CHAT_INPUT'
      ? {
          name: this.name,
          description: this.description || `${this.name.charAt(0).toUpperCase() + this.name.slice(1)} Command`,
          type: 'CHAT_INPUT',
          ...(this.options && { options: this.args }),
          defaultPermission: this.defaultPermission,
        }
      : {
          name: this.name,
          description: '',
          type: this.type,
          defaultPermission: this.defaultPermission,
        };
  }
}

module.exports = Command;
