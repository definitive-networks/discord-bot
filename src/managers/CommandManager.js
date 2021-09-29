'use strict';

const { BaseManager, Collection } = require('discord.js');
const Command = require('../Command.js');
const { isSameData } = require('./Util.js');

class CommandManager extends BaseManager {
  constructor(client) {
    super(client);

    this.cache = new Collection();
  }

  create(data) {
    if (this.client && Validator.isCommand(data)) {
      this.cache
        .set(data.name, new Command(this.client, data))
        .catch(err => this.client.emit('error', `Command could not be created: ${err}`));
    } else {
      this.client.emit('warn', `Command data invalid:\n${data}`);
    }
  }

  async handle(event) {
    if (event.commandId) {
      await this.handleSlash(event);
    } else {
      await this.handleMessage(event);
    }
  }

  shouldHandle(event) {
    if (event.commandId) return this.cache.has(event.commandName);
    if (event.partial || event.author.bot || event.author.id === this.client.user.id) return false;
    return true;
  }

  parseMessage(message) {
    const guildDb = message.guild && this.client.database.getGuild(message.guild.id);
    let prefix = guildDb.prefix ?? this.client.defaultPrefix;
    const clientMention = new RegExp(`^<@!?${this.client.user.id}> `);
    prefix = message.content.match(clientMention) ? message.content.match(clientMention)[0] : prefix;

    if (message.content.indexOf(prefix) !== 0) return false;

    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    return {
      args: args,
      command: this.cache.get(command) || this.cache.find(c => c.aliases && c.aliases.includes(command)),
      guildDb: guildDb,
    };
  }

  async handleMessage(message) {
    if (!this.shouldHandle(message)) return;
    try {
      let cmdMsg = this.parseMessage(message);
      if (!cmdMsg.command) return;
      let command = cmdMsg.command;
      if (!command.isUsable(message, cmdMsg.guildDb)) return;

      if (command.args && !cmdMsg.args.length) {
        let noArgsReply = 'No arguments provided.';
        if (command.usage) {
          noArgsReply += `\nUsage: \`${cmdMsg.guildDb.prefix || this.client.defaultPrefix}${command.name} ${
            command.usage
          }\``;
        }
        message.channel.send(noArgsReply);
        return;
      }
      await command.execute(message, cmdMsg.args, this.client, cmdMsg.guildDb);
    } catch (error) {
      this.client.emit(
        'warn',
        `Failed to properly acknowledge ${message.id} in #${message.channel.name} (${message.channel.id}).`,
      );
      this.client.emit('error', error);
    }
  }

  async handleSlash(interaction) {
    if (!this.shouldHandle(interaction)) return;
    try {
      const command = this.cache.get(interaction.commandName);
      if (!command || !command.isValidSlash()) return;
      const guildDb = interaction.inGuild() && this.client.database.getGuild(interaction.guildId);
      if (!command.isUsable(interaction, guildDb)) return;
      await command.SlashCommand.execute(interaction, interaction.options, this.client, guildDb);
    } catch (error) {
      this.client.emit('warn', `Failed to properly acknowledge ${interaction.id} in #${interaction.channelId}.`);
      this.client.emit('error', error);
    }
  }

  async deleteCommands(commands) {
    if (commands.size || commands.length) {
      await Promise.all(commands.map(cmd => this.invalidCommand(cmd) && this.delete(cmd)));
    }
  }

  async syncSlash() {
    try {
      let globalCommands = await this.client.application.commands.fetch();
      if (globalCommands.size) {
        await Promise.all(globalCommands.map(cmd => this.shouldDeleteSlash(cmd) && this.deleteSlash(cmd)));
      }
      let guildCommands = await Promise.all(this.client.guilds.cache.map(guild => guild.commands.fetch()));
      if (guildCommands.length) {
        let guildCommandsToDelete = guildCommands
          .filter(guild => guild.size)
          .flatMap(guild => guild.filter(cmd => this.shouldDeleteSlash(cmd)).map(cmd => cmd));
        if (guildCommandsToDelete.length) {
          await Promise.all(guildCommandsToDelete.map(cmd => this.deleteSlash(cmd)));
        }
      }
      if (this.cache.size) {
        // Update global commands
        await Promise.all(
          this.cache.filter(cmd => cmd.isValidSlash() && !cmd.guildOnly).map(cmd => this.processSlash(cmd)),
        );
        // Update guild commands
        let guildCommandsToUpdate = this.client.guilds.cache
          .map(guild =>
            this.cache
              .filter(cmd => cmd.isValidSlash() && cmd.guildOnly === true)
              .map(cmd => ({ command: cmd, guild: guild })),
          )
          .flat(1);
        if (guildCommandsToUpdate.length) {
          await Promise.all(guildCommandsToUpdate.map(obj => this.processSlash(obj.command, obj.guild)));
        }
      }
    } catch (error) {
      this.client.emit('warn', `Failed to update slash commands!`);
      this.client.emit('error', error);
    }
  }

  shouldDeleteSlash(slash) {
    const command = this.cache.get(slash.name);
    const commandId = this.client.database.getCommand(command.name, `${slash.guild ? slash.guildId : 'global'}`)

    switch (true) {
      case !command || !commandId:
      case slash.id !== commandId:
      case !command.isValidSlash():
      case slash.guild && !command.guildOnly:
      case !slash.guild && command.guildOnly: {
        return true;
      }
      default: {
        return false;
      }
    }
  }

  async deleteSlash(slash) {
    const guild = slash.guild;
    try {
      const deletedCommand = await slash.delete();
      if (deletedCommand) {
        this.client.emit(
          'debug',
          `Deleted ${guild ? '' : 'global '}${slash.name} slash command in ${
            guild ? `${guild.name} (${slash.guildId})` : 'Discord'
          }.`,
        );
      }
      const deletedEntry = await this.client.database.commands.delete({
        where: {
          guildId: slash.guild ? slash.guildId : 'global',
          name: slash.name,
        },
      });
      if (deletedEntry) {
        this.client.emit(
          'debug',
          `Deleted ${guild ? '' : 'global '}${slash.name} slash command ${
            guild ? `for ${guild.name} (${guild.id}) ` : ''
          }from the database.`,
        );
      }
    } catch (error) {
      this.client.emit(
        'warn',
        `Failed to remove outdated ${guild ? '' : 'global '}slash commands${
          guild ? `for ${guild.name} (${guild.id})` : ''
        }!`,
      );
      this.client.emit('error', error);
    }
  }

  async processSlash(command, guild) {
    if ((guild && !command.guildOnly) || (!guild && command.guildOnly)) return;
    try {
      const commandId = await this.client.database.commands.get(`${guild ? guild.id : 'global'}.${command.name}`);
      const slashManager = guild ? guild.commands : this.client.application.commands;
      const slash = commandId && slashManager.cache.get(commandId);
      const dataMatches = slash && isSameData(command.slashData, slash);

      if (dataMatches) {
        this.client.emit(
          'debug',
          `Found ${guild ? '' : 'global '}${slash.name} slash command in ${
            guild ? `${guild.name} (${guild.id})` : 'Discord'
          }.`,
        );
      } else {
        let data;
        if (slash) {
          data = await slash.edit(command.slashData);
          this.client.emit(
            'debug',
            `Edited ${guild ? '' : 'global '}${data.name} slash command in ${
              guild ? `${guild.name} (${guild.id})` : 'Discord'
            }.`,
          );
        } else {
          data = await slashManager.create(command.slashData);
          this.client.emit(
            'debug',
            `Created ${guild ? '' : 'global '}${data.name} slash command in ${
              guild ? `${guild.name} (${guild.id})` : 'Discord'
            }.`,
          );
        }
        await this.client.database.commands.set(`${guild ? guild.id : 'global'}.${data.name}`, data.id);
        this.client.emit(
          'debug',
          `Updated ${guild ? '' : 'global '}${data.name} slash command ${
            guild ? `for ${guild.name} (${guild.id}) ` : ''
          }in the database.`,
        );
      }
    } catch (error) {
      this.client.emit(
        'warn',
        `Failed to update ${guild ? '' : 'global '}slash commands${guild ? ` in ${guild.name} (${guild.id})` : ''}!`,
      );
      this.client.emit('error', error);
    }
  }
}

module.exports = CommandManager;
