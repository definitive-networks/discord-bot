'use strict';
const { Collection, MessageEmbed } = require('discord.js');

class CommandsCollection extends Collection {
  constructor(client) {
    super();
    this.client = client;
  }

  isValid(command) {
    switch (true) {
      case !command || !command.name: {
        return false;
      }
      case !this.isValidSlash(command) && !command.execute: {
        return false;
      }
      default: {
        return true;
      }
    }
  }

  isValidSlash(command) {
    switch (true) {
      case !command || !command.name: {
        return false;
      }
      case !('SlashCommand' in command): {
        return false;
      }
      case !command.SlashCommand: {
        return false;
      }
      case !command.SlashCommand.execute: {
        return false;
      }
      default: {
        return true;
      }
    }
  }

  isValidMessage(message) {
    switch (true) {
      case message.partial || message.author.bot: {
        return false;
      }
      case message.author.id === message.client.user.id: {
        return false;
      }
      default: {
        return true;
      }
    }
  }

  isSameData(data = {}, dataMatch = {}) {
    const dataLength = Object.keys(data).length;
    const matches = Object.keys(data)
      .map(key => dataMatch[key] === data[key] || JSON.stringify(dataMatch[key]) === JSON.stringify(data[key]))
      .filter(val => val === true);
    return matches.length === dataLength;
  }

  async handle(event, client = this.client) {
    if (!event.commandId) {
      await this.tryCommand(event, client);
    } else {
      await this.trySlash(event, client);
    }
  }

  async trySlash(interaction, client = this.client) {
    if (!this.has(interaction.commandName)) {
      client.emit('warn', `Unknown command: ${interaction.commandName}`);
      return;
    }
    try {
      const command = this.get(interaction.commandName);
      let guildDb = interaction.inGuild() && (await client.database.getGuild(interaction.guildId));
      if (guildDb && guildDb[command.name] === false) {
        await interaction.reply({
          embeds: [new MessageEmbed().setDescription('Command is disabled in this guild!')],
          ephemeral: true,
        });
        return;
      }
      await command.SlashCommand.execute(interaction, interaction.options, client, guildDb);
    } catch (error) {
      client.emit('warn', `Failed to properly acknowledge ${interaction.id} in #${interaction.channelId}.`);
      client.emit('error', error);
    }
  }

  async tryCommand(message, client = this.client) {
    if (!this.isValidMessage(message)) return;
    const dmChannelTypes = ['DM', 'GROUP_DM'];
    try {
      let guildDb =
        !dmChannelTypes.includes(message.channel.type) && (await client.database.getGuild(message.guild.id));
      let prefix = guildDb.prefix ?? client.config.defaultPrefix;
      const clientMention = new RegExp(`^<@!?${client.user.id}> `);

      prefix = message.content.match(clientMention) ? message.content.match(clientMention)[0] : prefix;

      if (message.content.indexOf(prefix) !== 0) return;

      const args = message.content.slice(prefix.length).trim().split(/ +/g);
      const command = args.shift().toLowerCase();
      const cmd = this.get(command) || this.find(c => c.aliases && c.aliases.includes(command));

      if (!cmd || (cmd.guildOnly && dmChannelTypes.includes(message.channel.type))) return;

      if (guildDb && guildDb[cmd.name] === false) {
        message.channel.send({
          embeds: [new MessageEmbed().setDescription(`\`${cmd.name}\` command is disabled in this guild!`)],
        });
        return;
      }

      let noArgsReply = false;
      if (cmd.args && !args.length) {
        noArgsReply = 'No arguments provided.';
        if (cmd.usage) {
          noArgsReply += `\nUsage: \`${guildDb.prefix || client.config.defaultPrefix}${cmd.name} ${cmd.usage}\``;
        }
        message.channel.send(noArgsReply);
      }

      let noPermsReply = false;
      const isBotOwner = client.owners.includes(message.author.id);
      if (!dmChannelTypes.includes(message.channel.type)) {
        const authorPerms = message.channel.permissionsFor(message.author);
        const clientPerms = message.channel.permissionsFor(client.user);
        const customPermsFilter = perm => !['BOT_OWNER', 'GUILD_OWNER'].includes(perm);
        if (
          !clientPerms ||
          ('permissions' in cmd && cmd.permissions.channel && !clientPerms.has(cmd.permissions.channel))
        ) {
          noPermsReply += `\nI'm missing the required permissions: ${
            cmd.permissions.channel.length
              ? cmd.permissions.channel.map(perm => `\`${perm}\` `)
              : `\`${cmd.permissions.channel}\``
          }`;
        }
        if (
          !authorPerms ||
          ('permissions' in cmd &&
            cmd.permissions.member &&
            (!authorPerms.has(cmd.permissions.member.filter(customPermsFilter)) ||
              (cmd.permissions.member.includes('BOT_OWNER') && !isBotOwner) ||
              (cmd.permissions.member.includes('GUILD_OWNER') && message.author.id !== message.guild.ownerId)))
        ) {
          noPermsReply += `\nYou lack the required permissions: ${
            cmd.permissions.member.length
              ? cmd.permissions.member.map(perm => `\`${perm}\` `)
              : `\`${cmd.permissions.member}\``
          }`;
        }
      } else if (cmd.permissions.member.includes('BOT_OWNER') && !isBotOwner) {
        noPermsReply = "You're not authorized to use this permission!";
      }
      if (noPermsReply) message.channel.send(noPermsReply);
      if (noArgsReply || noPermsReply) return;
      await cmd.execute(message, args, client, guildDb);
    } catch (error) {
      client.emit(
        'warn',
        `Failed to properly acknowledge ${message.id} in #${message.channel.name} (${message.channel.id}).`,
      );
      client.emit('error', error);
    }
  }

  syncSlash(client = this.client) {
    if (this.size === 0) return;
    this.map(async command => {
      try {
        await client.guilds.cache.map(async guild => {
          await this.syncSlashIn(client, command, guild);
        });
        await this.syncSlashIn(client, command);
      } catch (error) {
        client.emit('warn', `Failed to update slash commands!`);
        client.emit('error', error);
      }
    });
  }

  async syncSlashIn(client = this.client, command, guild) {
    if (!this.isValidSlash(command)) return;
    try {
      let commandData = {
        name: command.name,
        description: command.description ?? `${command.name.charAt(0).toUpperCase() + command.name.slice(1)} Command`,
        options: command.SlashCommand.options ?? [],
        defaultPermission: command.SlashCommand.defaultPermission ?? true,
      };

      let commandId = await client.database.commands.get(`${guild ? guild.id : 'global'}.${command.name}`);
      let cmdManager = guild ? guild.commands : client.application.commands;
      let commands = await cmdManager.fetch();

      if (commands.size) {
        commands.map(async cmd => {
          try {
            const localCmd = this.get(cmd.name);
            if (cmd.name === command.name && cmd.id !== commandId) {
              await cmd.delete();
              client.emit(
                'debug',
                `Deleted ${guild ? '' : 'global '}${cmd.name} slash command in ${
                  guild ? `${guild.name} (${guild.id})` : 'Discord'
                }.`,
              );
            } else if (
              (localCmd && guild && !localCmd.guildOnly) ||
              (localCmd && !guild && localCmd.guildOnly === true)
            ) {
              client.database.commands.delete(`${guild ? guild.id : 'global'}.${cmd.name}`);
              client.emit(
                'debug',
                `Deleted ${guild ? '' : 'global '}${cmd.name} slash command ${
                  guild ? `for ${guild.name} (${guild.id}) ` : ''
                }from the database.`,
              );
            }
          } catch (e) {
            client.emit(
              'warn',
              `Failed to remove outdated ${guild ? '' : 'global '}slash commands${
                guild ? `for ${guild.name} (${guild.id})` : ''
              }!`,
            );
            client.emit('error', e);
          }
        });
      }
      if ((guild && command.guildOnly) || (!guild && !command.guildOnly)) {
        let data;
        const curCommand = commandId && commands.get(commandId);
        let dataMatches = curCommand && this.isSameData(commandData, curCommand);
        switch (true) {
          case dataMatches: {
            client.emit(
              'debug',
              `Found ${guild ? '' : 'global '}${curCommand.name} slash command in ${
                guild ? `${guild.name} (${guild.id})` : 'Discord'
              }.`,
            );
            break;
          }
          case curCommand: {
            data = await cmdManager.edit(commandId, commandData);
            client.emit(
              'debug',
              `Edited ${guild ? '' : 'global '}${data.name} slash command in ${
                guild ? `${guild.name} (${guild.id})` : 'Discord'
              }.`,
            );
            break;
          }
          default: {
            data = await cmdManager.create(commandData);
            client.emit(
              'debug',
              `Created ${guild ? '' : 'global '}${data.name} slash command in ${
                guild ? `${guild.name} (${guild.id})` : 'Discord'
              }.`,
            );
            break;
          }
        }
        if (!dataMatches) {
          await client.database.commands.set(`${guild ? guild.id : 'global'}.${data.name}`, data.id);
          client.emit(
            'debug',
            `Updated ${guild ? '' : 'global '}${data.name} slash command ${
              guild ? `for ${guild.name} (${guild.id}) ` : ''
            }in the database.`,
          );
        }
      } else if (commandId) {
        if (commands.has(commandId)) {
          await cmdManager.delete(commandId);
          client.emit(
            'debug',
            `Deleted ${guild ? '' : 'global '}${command.name} slash command in ${
              guild ? `${guild.name} (${guild.id})` : 'Discord'
            }.`,
          );
        }
        await client.database.commands.delete(`${guild ? guild.id : 'global'}.${command.name}`);
        client.emit(
          'debug',
          `Deleted ${guild ? '' : 'global '}${command.name} slash command ${
            guild ? `for ${guild.name} (${guild.id}) ` : ''
          }from the database.`,
        );
      }
    } catch (error) {
      client.emit(
        'warn',
        `Failed to update ${guild ? '' : 'global '}slash commands${guild ? ` in ${guild.name} (${guild.id})` : ''}!`,
      );
      client.emit('error', error);
    }
  }
}

module.exports = CommandsCollection;
