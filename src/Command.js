'use strict';

const { escapeMarkdown, Permissions } = require('discord.js');
const { oneLine, stripIndent, stripIndents } = require('common-tags');

class Command {
  constructor(client, data) {
    this.constructor._validate(client, data);

    Object.defineProperty(this, 'client', { value: client });

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

    this.nsfw = Boolean(data.nsfw);

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

  hasPermission(interaction, ownerOverride = true) {
    if (!this.ownerOnly && !this.userPermissions) return true;
    if (ownerOverride && this.client.isOwner(interaction.user)) return true;

    if (this.ownerOnly && (ownerOverride || !this.client.isOwner(interaction.user))) {
      return `The \`${this.name}\` command can only be used by the bot owner.`;
    }

    if (interaction.channel.type === 'text' && this.userPermissions) {
      const missing = interaction.memberPermissions?.missing(this.userPermissions);
      if (missing.length > 0) {
        if (missing.length === 1) {
          return `The \`${this.name}\` command requires you to have the "${missing[0]}" permission.`;
        }
        return oneLine`
          The \`${this.name}\` command requires you to have the following permissions:
          ${missing?.join(', ')}
        `;
      }
    }

    return true;
  }

  onBlock(interaction, reason, data) {
    switch (reason) {
      case 'guildOnly': {
        return interaction.reply({
          content: `The \`${this.name}\` command must be used within a guild.`,
          ephemeral: true,
        });
      }
      case 'nsfw': {
        return interaction.reply({
          content: `The \`${this.name}\` command can only be used in NSFW channels.`, ephemeral: true });
      }
      case 'permission': {
        if (data.response) {
          return interaction.reply({ content: data.response, ephemeral: true });
        }
        return interaction.reply({ content: `You do not have permission to use the \`${this.name}\` command.` });
      }
      case 'clientPermissions': {
        if (data.missing.length === 1) {
          return interaction.reply({
            content: `I need the "${missing[0]}" permission for the \`${this.name}\` command to work.`,
            ephemeral: true,
          });
        }
        return interaction.reply({
          content: oneLine`
            I need the following permissions for the \`${this.name}\` command to work: ${data.missing?.join(', ')}
          `,
          ephemeral: true,
        });
      }
      case 'throttling': {
        return interaction.reply({ 
          content: oneLine`
            You may not use the \`${this.name}\` command again for another ${data.remaining.toFixed(1)} seconds.
          `,
          ephemeral: true,
        });
      }
      default: {
        return null;
      }
    }
  }

  onError(err, interaction) {
    const owners = this.client.owners;
    const ownerList = owners ? owners.map((usr, i) => {
      const or = i === owners.length - 1 && owners.length > 1 ? 'or ' : '';
      return `${or}${escapeMarkdown(usr.username)}#${usr.discriminator}`;
    }).join(owners.length > 2 ? ', ' : ' ') : '';

    const invite = this.client.options.invite;

    const errResponse = {
      content: stripIndents`
        An error occurred while running the command: \`${err.name}: ${err.message}\`
        You shouldn't ever receive an error like this.
        Please contact ${ownerList || 'the bot owner'}${invite ? ` in this server: ${invite}`: '.'}
      `,
      ephemeral: true,
    };

    return interaction.replied ? interaction.followUp(errResponse) : interaction.reply(errResponse);
  }

  throttle(userId) {
    if (!this.throttler || this.client.isOwner(userId)) return null;

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

  static _validate(client, data) {
    if (!client) throw new Error('A client must be specified.');
    if (typeof data !== 'object') throw new TypeError('Command data must be an Object.');
    if (data.type) {
      if (typeof data.type !== 'string') throw new TypeError('Command type must be a string.');
      if (data.type !== ('CHAT_INPUT' || 'USER' || 'ROLE')) {
        throw new Error('Command type must be one of the following: CHAT_INPUT, USER, ROLE');
      }
    }
    if (typeof data.name !== 'string') throw new TypeError('Command name must be a string.');
    if (!data.name.length || data.name.length > 32) throw new Error('Command name must be between 1-32 characters.');
    if (data.type === ('USER' || 'MESSAGE') && !(/([\w](-| )?)*[\w]+/.test(data.name))) {
        throw new Error('Command name may only contain letters, numbers, underscores, dashes, and spaces.');
    } else if (data.name !== data.name.toLowercase() || !(/[\w-]+/.test(data.name))) {
      throw new Error('Command name may only contain lowercase letters, numbers, underscores, and dashes.');
    }
    if (data.description) {
      if (typeof data.description !== 'string') {
        throw new TypeError('Command description must be string.');
      }
      if (data.type !== ('USER' || 'MESSAGE') && (!data.description.length || data.description.length > 100)) {
        throw new Error('Command description must be between 1-100 characters.');
      }
    }
    if (data.guildIds && (!Array.isArray(data.guildIds) || data.guildIds.some(gid => typeof gid !== 'string'))) {
      throw new TypeError('Command guildIds must be an Array of strings.');
    }
    if (data.clientPermissions) {
      if (!Array.isArray(data.clientPermissions)) {
        throw new TypeError('Command clientPermissions must be an Array of permission key strings.');
      }
      for (const perm of data.clientPermissions) {
        if (!Permissions.FLAGS[perm]) throw new RangeError(`Invalid command clientPermission: ${perm}`);
      }
    }
    if (data.userPermissions) {
      if (!Array.isArray(data.userPermissions)) {
        throw new TypeError('Command userPermissions must be an Array of permission key strings.');
      }
      for (const perm of data.userPermissions) {
        if (!Permissions.FLAGS[perm]) throw new RangeError(`Invalid command userPermission: ${perm}`);
      }
    }
    if (data.permissions) {
      if (typeof data.permissions !== 'object') {
        throw new TypeError('Command permissions must be an Object.')
      }
      for (const [gid, perms] of Object.entries(data.permissions)) {
        if (typeof gid !== 'string') throw new TypeError('Command permissions key must be string.');
        if (!Array.isArray(perms)) {
          throw new TypeError(stripIndent`
            Command permissions object values must be an array of ApplicationCommandPermissionData objects.
          `);
        }
      }
    }
    if (data.args && (!Array.isArray(data.args) || data.args.length > 25)) {
      throw new TypeError('Command args must be an Array with 25 or less items.');
    }
    if (data.throttler) {
      if (typeof data.throttler !== 'object') throw new TypeError('Command throttler must be an Object.');
      if (typeof data.throttler.duration !== 'number' || isNaN(data.throttler.duration)) {
        throw new TypeError('Command throttler duration must be a number.');
      }
      if (data.throttler.duration < 1) throw new RangeError('Command throttler duration must be at least 1.');
      if (typeof data.throttler.usages !== 'number' || isNaN(data.throttler.usages)) {
        throw new TypeError('Command throttler usages must be a number.');
      }
      if (data.throttler.usages < 1) throw new RangeError('Command throttler usages must be at least 1.');
    }
  }
}