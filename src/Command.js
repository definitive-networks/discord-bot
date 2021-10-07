'use strict';

const { oneLine, stripIndent } = require('common-tags');
const { Validator } = require('./util');

class Command {
  constructor(client, data) {
    this.client = client;
    this.manager = client.commands;

    const validator = Validator.isCommand(data);
    if (validator.error) {
      throw new Error(stripIndent`
      Invalid command object was provided: ${data.name && `('${data.name}' command)`}
        ${validator.error.details.map(detail => `${detail.message}\n`)}
    `);
    }

    this.type = data.type || 'CHAT_INPUT';
    this.name = data.name;
    if (data.description) this.description = data.description;
    this.protected = data.protected || false;
    this.args = data.args;
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

  get isGlobal() {
    return !this.guildIds || (this.guildIds?.length && this.guildIds.includes('global'));
  }

  hasPermission(interaction) {
    if (interaction.inGuild()) {
      if (this.requiredPermissions?.member) {
        if (
          (this.requiredPermissions.member.includes('BOT_OWNER') && !this.client.isOwner(interaction.user.id)) ||
          (this.requiredPermissions.member.includes('GUILD_OWNER') && interaction.user.id !== interaction.guild.ownerId)
        ) {
          return `You're not authorized to use the \`${this.name}\` command.`;
        }
        const missing = interaction.member.permissions.missing(
          this.requiredPermissions.member.filter(perm => !['BOT_OWNER', 'GUILD_OWNER'].includes(perm)),
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
      const currentPermissions =
        this.permissions && this.permissions[(interaction.inGuild() && interaction.guildId) || 'global'];
      if (currentPermissions) {
        const relevantPermissions = currentPermissions.filter(perm => !perm.permission);
        if (relevantPermissions.some(perm => perm.type === 'CHANNEL' && perm.id === interaction.channelId)) {
          return `The \`${this.name}\` command is disabled for this channel.`;
        }
        if (relevantPermissions.some(perm => perm.type === 'USER' && perm.id === interaction.user?.id)) {
          return `You do not have permission to use the \`${this.name}\` command.`;
        }
        if (relevantPermissions.some(perm => perm.type === 'ROLE' && interaction.member?.roles?.cache.has(perm.id))) {
          const blockedRoleNames = [];
          relevantPermissions
            .filter(perm => interaction.member.roles.cache.has(perm.id))
            .forEach(perm => {
              if (perm.type === 'ROLE') {
                const permRole = interaction.member.roles.cache.get(perm.id);
                if (permRole) blockedRoleNames.push(permRole.name);
              }
            });
          return `The \`${this.name}\` command is disabled for the \`${blockedRoleNames.join(', ')}\` role${
            blockedRoleNames.length > 0 && 's'
          } in this guild.`;
        }
      }
    }
    return true;
  }

  updatePermissions(guildId, permissions) {
    for (const permToAdd of permissions) {
      const selPermIndex = this.permissions[guildId || 'global'].findIndex(perm => perm.id === permToAdd.id);
      if (selPermIndex > -1) {
        this.permissions[guildId || 'global'][selPermIndex] = permToAdd;
      } else {
        this.permissions[guildId || 'global'].push(permToAdd);
      }
    }
    return this.permissions[guildId || 'global'];
  }

  async onBlock(interaction, reason, data) {
    switch (reason) {
      case 'permission': {
        if (data.response) {
          await interaction.reply({ content: data.response, ephemeral: true });
        } else {
          await interaction.reply({
            content: `You do not have permission to use the \`${this.name}\` command.`,
            ephemeral: true,
          });
        }
        break;
      }
      case 'throttling': {
        await interaction.reply({
          content: `You must wait ${data.remaining.toFixed(1)} seconds to use the \`${this.name}\` command again.`,
          ephemeral: true,
        });
      }
    }
  }

  // eslint-disable-next-line no-unused-vars
  async onError(interaction, error) {
    await interaction.reply({ content: 'An error occurred while running the command.', ephemeral: true });
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
        }, this.throttler.duration * 1000),
      };
      this._throttles.set(userId, throttle);
    }
    return throttle;
  }

  toJSON(guildId) {
    return this.type === 'CHAT_INPUT'
      ? {
          name: this.name,
          description: this.description || `${this.name.charAt(0).toUpperCase() + this.name.slice(1)} Command`,
          type: 'CHAT_INPUT',
          ...(this.args && {
            options: typeof this.args === 'function' ? this.args(this.client, guildId) : this.args,
          }),
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
