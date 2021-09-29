const { ApplicationCommandOptionType, GuildMember } = require('discord.js');

module.exports = {
  name: 'set',
  description: 'Edit settings for the bot.',
  global: false,
  permissions: {
    member: ['BOT_OWNER', 'GUILD_OWNER', 'ADMINISTRATOR']
  },
  arguments: (client) => [
    {
      type: ApplicationCommandOptionType.SUB_COMMAND,
      name: 'toggle',
      description: 'Toggle a command for an entire guild, channel, role, or user.',
      options: [
        {
          type: ApplicationCommandOptionType.STRING,
          name: 'command',
          description: 'The command to toggle.',
          required: true,
          choices: [
            client.commands.cache.map(cmd => (
              { name: cmd.name, value: `${cmd.name}_cmd` }
            )) ?? { name: 'No Commands Found', value: 'no_commands_found'}
          ]
        },
        {
          type: ApplicationCommandOptionType.BOOLEAN,
          name: 'boolean',
          description: 'Whether to enable or disable the command.',
          required: true,
        },
        {
          type: ApplicationCommandOptionType.MENTIONABLE,
          name: 'target',
          description: 'The user or role to toggle this command for.'
        },
        {
          type: ApplicationCommandOptionType.CHANNEL,
          name: 'channel',
          description: 'The channel to toggle the command for.'
        }
      ]
    },
  ],
  //
  execute(interaction, options, client) {
    const subCommand = options.getSubcommand();
    switch(subCommand) {
      case ('toggle'): {

        const toggleCmd = options.get('command');

        if (client.commands.cache.has(toggleCmd) && toggleCmd !== 'set') {

          const toggleVal = options.get('boolean');
          const toggleTarget = options.get('target');
          const toggleChannel = options.get('channel');

          const targetCmd = client.commands.cache.get(toggleCmd);
          const targetGuild = client.guilds.cache.get(targetCmd.guildId);

          const permissionData = {
            command: targetCmd.id,
            permissions: [{
              id: toggleTarget.id,
              type: toggleTarget.name ? 'ROLE' : 'USER',
              permission: toggleVal
            }]
          };

          (toggleChannel || !targetCmd.global)
            ? targetGuild.commands.permissions.add(permissionData)
            : client.application.commands.permissions.add(permissionData);

          client.database.guilds.set(`${targetCmd.guildId}.${toggleCmd}`, toggleVal);
          interaction.reply(`${toggleVal ? 'Enabled' : 'Disabled'} command: \`${toggleCmd}\``);
        }
      }
    }
  },
  async execute(message, args, client, guildDb) {
    switch(args[0]) {
      // Set prefix in guild example
      case ('prefix'): {
        if (args[1]) {
          try {
            // An example of modifying a pre-existing table in the database
            const hasPrefixCol = await client.database.query.schema.hasColumn('guilds', 'prefix');
            if (!hasPrefixCol) {
              await client.database.query.schema.alterTable('guilds', table => {
                table.string('prefix', 32);
              });
            }
            await guildDb.insert({gid: message.guild.id, prefix: args[1]}).onConflict('gid').merge(['prefix']);
            message.channel.send(`Prefix updated: \`${args[1]}\``);
          } catch (error) {
            client.emit('warn', `Failed to update prefix in the database for ${message.guild.name} (${message.guild.id}).`);
            client.emit('error', error);
          }
        } else {
          message.channel.send(`No prefix specified!`);
        }
        break;
      }
      // Enable command in guild example
      case ('enable'): {
        if (args[1] && client.commands.cache.has(args[1])) {
          try {
            let disabledCommands = await guildDb.select('disabled_commands');
            disabledCommands = JSON.parse(Object.values(disabledCommands[0]).flat());
            if (!disabledCommands.includes(args[1])) {
              message.channel.send('Command already enabled!');
            } else {
              await guildDb.update('disabled_commands', JSON.stringify(disabledCommands.filter(cmd => cmd !== args[1])));
              message.channel.send(`Enabled command: \`${args[1]}\``);
            }
          } catch (error) {
            client.emit('warn', `Failed to set ${args[1]} command as enabled in the database for ${message.guild.name} (${message.guild.id}).`);
            client.emit('error', error);
          }
        } else {
          (args[1])
            ? message.channel.send(`Command not found!`)
            : message.channel.send('No command specified!');
        }
        break;
      }
      // Disable command in guild example
      case ('disable'): {
        // prevent the settings command from being disabled
        if (args[1] && args[1] !== 'set' && client.commands.cache.has(args[1])) {
          try {
            let disabledCommands = await guildDb.select('disabled_commands');
            disabledCommands = JSON.parse(Object.values(disabledCommands[0]).flat());
            if (disabledCommands.includes(args[1])) {
              message.channel.send('Command already disabled!');
            } else {
              const validDisabledCmds = disabledCommands.length
                ? disabledCommands.filter(cmd => client.commands.cache.has(cmd) && cmd !== args[1])
                : [];
              await guildDb.update('disabled_commands', JSON.stringify([ args[1], ...validDisabledCmds ]));
              message.channel.send(`Disabled command: \`${args[1]}\``);
            }
          } catch (error) {
            client.emit('warn', `Failed to set ${args[1]} command as disabled in the database for ${message.guild.name} (${message.guild.id}).`);
            client.emit('error', error);
          }
        } else {
          client.commands.cache.has(toggleCmd)
            ? interaction.reply('Cannot disable settings command!')
            : interaction.reply('Command not found!');
        }
        break;
      }
    }
  }
};