const { ApplicationCommandOptionType, GuildMember } = require('discord.js');

module.exports = {
  name: 'set',
  description: 'Edit settings for the bot.',
  global: false,
  permissions: {
    member: ['BOT_OWNER', 'GUILD_OWNER', 'ADMINISTRATOR']
  },
  //
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