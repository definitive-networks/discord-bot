'use strict';

const { oneLine, stripIndent } = require('common-tags');
const { Validator } = require('../util');

class Command {
  constructor(client, data) {
    this.constructor.validate(client, data);

    Object.defineProperty(this, 'client', { value: client });

    const validator = Validator.isCommand(data);
    if (validator.error) {
      throw new Error(stripIndent`
        Invalid command object was provided: ${data.name && `('${data.name}' command)`}
        ${validator.error.details.map(detail => `${detail.message}\n`)}
      `);
    }

    this.type = data.type ?? 'CHAT_INPUT';

    this.name = data.name;

    this.description = data.description ?? `${this.name.charAt(0).toUpperCase() + this.name.slice(1)} Command`;

    this.protected = data.protected ?? false;

    this.ownerOnly = Boolean(data.ownerOnly);

    this.guildOnly = Boolean(data.guildOnly);

    this.guildIds = data.guildIds || null;

    this.defaultPermission = data.defaultPermission ?? true;
    
    this.clientPermissions = data.clientPermissions || null;

    this.userPermissions = data.userPermissions || null;

    this.permissions = data.permissions || null;

    this.args = data.args;

    this.throttler = data.throttler || null;

    this.deferEphemeral = data.deferEphemeral ?? false;

    this.execute = data.execute;

    this._ids = new Collection();

    this._throttles = new Map();
  }

  get ids() {
    return this._ids;
  }

  get keyName() {
    const prefix = this.guildIds?.join(',') ?? 'global';
    return `${this.type}:${prefix}:${this.name}`;
  }

  static isGlobal(data = this) {
    return !data.guildIds || data.guildIds?.includes('global');
  }

  _clone() {
    return Object.assign(Object.create(this), this);
  }

  _patch(data) {
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
        const missing = interaction.memberPermissions.missing(
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
      const commandPermissions = interaction.command.permissions.fetch()
        .then(perms => { return perms } )
        .catch(err);

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
            blockedRoleNames.length > 1 && 's'
          } in this guild.`;
        }
      }
    }
    return true;
  }

  updatePermissions(guildId, permissions) {
    if (!permissions.length) return null;
    if (!guildId) guildId = 'all';
    if (!this.permissions) this.permissions = {};
    if (!this.permissions[guildId]) this.permissions[guildId] = [];
    for (const permToAdd of permissions) {
      const selPermIndex = this.permissions[guildId].findIndex(perm => perm.id === permToAdd.id);
      if (selPermIndex > -1) {
        this.permissions[guildId][selPermIndex] = permToAdd;
      } else {
        this.permissions[guildId].push(permToAdd);
      }
    }
    return this.permissions[guildId];
  }

  update(guildId, data) {
    if (data.name) this.name = data.name;
    if (data.description) this.description = data.description;
    if (this.ids.has(guildId)) await this.syncGuild(guildId);
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
}

module.exports = Command;
