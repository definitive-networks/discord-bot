'use strict';

const { MessageEmbed } = require('discord.js');

class Command {
  constructor(client, data) {
    this.client = client;
    this.name = data.name;
    this.group = data.group;
    this.description = data.description;
    this.guilds = data.guilds ?? [];
    this.permissions = {
      channel: data.permissions?.channel ?? [],
      member: data.permissions?.member ?? [],
    };
    this.args = data.args;
    this.execute = data.execute;
    this.SlashCommand = data.SlashCommand;
    this.slashData = data.SlashCommand && {
      name: data.name,
      description: data.description ?? `${data.name.charAt(0).toUpperCase() + data.name.slice(1)} Command`,
      options: data.SlashCommand.options ?? [],
      defaultPermission: data.SlashCommand.defaultPermission ?? true,
    };
  }

  static isValid(client, data) {
    switch (true) {
      case !client:
      case typeof data !== 'object':
      case typeof data.name !== 'string':
      case data.name !== data.name.toLowerCase():
      case !data.execute && (!data.SlashCommand || typeof data.SlashCommand !== 'object'):
      case !data.execute && data.SlashCommand && !data.SlashCommand.execute:
      case data.group && typeof data.group !== 'string':
      case data.description && typeof data.description !== 'string':
      case data.permissions && data.permissions.member && !Array.isArray(data.permissions.member):
      case data.permissions && data.permissions.channel && !Array.isArray(data.permissions.channel): {
        return false;
      }
      default: {
        return true;
      }
    }
  }

  isValidSlash() {
    return !!(this.SlashCommand && this.SlashCommand.execute);
  }

  hasPermission(message) {
    if (!this.permissions.member && !message.guild) return true;
    if (
      (this.permissions.member.includes('BOT_OWNER') && !this.client.owners.includes(message.author.id)) ||
      (this.permissions.member.includes('GUILD_OWNER') && message.author.id !== message.guild.ownerId)
    ) {
      message.reply(`You're not authorized to use the \`${this.name}\` command.`);
      return false;
    }
    if (message.guild) {
      if (
        this.permissions.member &&
        (!this.client.owners.includes(message.author.id) || message.author.id !== message.guild.ownerId)
      ) {
        const missingPerms = message.channel
          .permissionsFor(message.author)
          .missing(this.permissions.member.filter(perm => !['BOT_OWNER', 'GUILD_OWNER'].includes(perm)));
        if (missingPerms.length > 0) {
          if (missingPerms.length === 1) {
            message.reply(`You lack the required permission for the \`${this.name}\` command: ${missingPerms[0]}`);
            return false;
          }
          message.reply(
            `You lack the required permissions for the \`${this.name}\` command: ${missingPerms.map(perm =>
              perm.join(', '),
            )}`,
          );
          return false;
        }
      }
      if (this.permissions.channel) {
        const missingPerms = message.channel.permissionsFor(this.client.user).missing(this.permissions.channel);
        if (missingPerms.length > 0) {
          if (missingPerms.length === 1) {
            message.reply(`I'm missing the required permissionf for the \`${this.name}\` command: ${missingPerms[0]}`);
            return false;
          }
          message.reply(
            `I'm missing the required permissions for the \`${this.name}\` command: ${missingPerms.map(perm =>
              perm.join(', '),
            )}`,
          );
          return false;
        }
      }
    }
    return true;
  }

  isUsable(event, guildDb) {
    if (this.guildOnly && !event.guild) return false;
    if (guildDb && guildDb[this.name] === false) {
      const disabledEmbed = new MessageEmbed().setDescription(`\`${this.name}\` command is disabled in this guild!`);
      let replyData = event.commandId ? { embeds: [disabledEmbed], ephemeral: true } : { embeds: [disabledEmbed] };
      event.reply(replyData);
      return false;
    }
    return event.commandId ? true : this.hasPermission(event);
  }
}

module.exports = Command;
