'use strict';

const { oneLine } = require('common-tags');

module.exports = {
  name: 'commands',
  description: 'Manage commands for this bot.',
  protected: true,
  guildIds: ['429077454636974090'],
  requiredPermissions: {
    member: ['BOT_OWNER', 'ADMINISTRATOR'],
  },
  args: (client, guildId) => [
    {
      type: 'SUB_COMMAND',
      name: 'toggle',
      description: 'Toggles a command in the current guild for a specific role, user, or channel.',
      options: [
        {
          type: 'STRING',
          name: 'command',
          description: 'The command to enable.',
          required: true,
          choices: (client.commands.registry.filter(
            cmd => !cmd.protected && (cmd.guildIds?.includes(guildId) || cmd.guildIds?.includes('all')),
          ).size &&
            client.commands.registry
              .filter(cmd => !cmd.protected && (cmd.guildIds?.includes(guildId) || cmd.guildIds?.includes('all')))
              .map(cmd => ({
                name: `${cmd.name} (${cmd.type.toLowerCase()}${cmd.type !== 'CHAT_INPUT' ? '_action' : ''})`,
                value: `${cmd.name}_${cmd.type}_cmd`,
              }))) || [
            {
              name: 'No Commands Found',
              value: 'no_commands_found',
            },
          ],
        },
        {
          type: 'BOOLEAN',
          name: 'enable',
          description: 'Whether to enable or disable this command.',
          required: true,
        },
        {
          type: 'MENTIONABLE',
          name: 'target',
          description: 'The user or role to enable this command for.',
        },
        {
          type: 'CHANNEL',
          name: 'channel',
          description: 'The channel to enable this command for.',
        },
      ],
    },
  ],
  execute: async (interaction, client) => {
    if (!interaction.inGuild()) return null;
    const subCommand = interaction.options.getSubcommand();
    switch (subCommand) {
      case 'toggle': {
        const selectedCommand = interaction.options.get('command');
        const registryCommand = client.commands.registry.find(
          cmd =>
            !cmd.protected &&
            `${cmd.name}_${cmd.type}_cmd` === selectedCommand.value &&
            cmd.ids.has(interaction.guildId),
        );
        if (!registryCommand) {
          return interaction.reply({ content: 'Unable to find the selected command.', ephemeral: true });
        }
        const commandId = registryCommand.ids.get(!registryCommand.isGlobal ? interaction.guildId : 'global');

        const shouldEnable = interaction.options.get('enable');
        const targetMentionable = interaction.options.get('target');
        const targetChannel = interaction.options.get('channel');

        if (
          targetMentionable?.value &&
          (targetMentionable.user || targetMentionable.member || targetMentionable.role)
        ) {
          const hasPermission = await client.application.commands.permissions.has({
            guild: interaction.guildId,
            command: commandId,
            permissionId: targetMentionable.user?.id || targetMentionable.member?.id || targetMentionable.role?.id,
          });
          if (hasPermission) {
            registryCommand.updatePermissions(interaction.guildId, [
              {
                id: targetMentionable.user?.id || targetMentionable.member?.id || targetMentionable.role?.id,
                ...((targetMentionable.user || targetMentionable.member) && { type: 'USER' }),
                ...(targetMentionable.role && { type: 'ROLE' }),
                permission: shouldEnable.value,
              },
            ]);
            return interaction.reply({
              content: oneLine`
                The \`${registryCommand.name}\` command is already ${shouldEnable.value ? 'enabled' : 'disabled'} for 
                <@${targetMentionable.user?.id || targetMentionable.member?.id || `&${targetMentionable.role?.id}`}> 
                (${targetMentionable.user?.id || targetMentionable.member?.id || targetMentionable.role?.id})
              `,
              ephemeral: true,
            });
          }
          const result = await client.application.commands.permissions[shouldEnable.value ? 'add' : 'remove']({
            guild: interaction.guildId,
            command: commandId,
            ...(shouldEnable.value && {
              permissions: [
                {
                  id: targetMentionable.user?.id || targetMentionable.member?.id || targetMentionable.role?.id,
                  ...((targetMentionable.user || targetMentionable.member) && { type: 'USER' }),
                  ...(targetMentionable.role && { type: 'ROLE' }),
                  permission: shouldEnable.value,
                },
              ],
            }),
            ...(!shouldEnable.value && (targetMentionable.user || targetMentionable.member)
              ? { users: targetMentionable.user?.id || targetMentionable.member?.id }
              : { roles: targetMentionable.role?.id }),
          });
          if (result) {
            registryCommand.updatePermissions(interaction.guildId, result);
            console.log(result);
            return interaction.reply({
              content: oneLine`
                ${shouldEnable.value ? 'Enabled' : 'Disabled'} \`${registryCommand.name}\` command for 
                <@${targetMentionable.user?.id || targetMentionable.member?.id || `&${targetMentionable.role?.id}`}> 
                (${targetMentionable.user?.id || targetMentionable.member?.id || targetMentionable.role?.id})
              `,
            });
          }
        } else if (targetChannel?.value && targetChannel.channel) {
          if (
            registryCommand.permissions[interaction.inGuild() ? interaction.guildId : 'global']?.some(
              perm =>
                perm.type === 'CHANNEL' &&
                perm.id === targetChannel.channel.id &&
                perm.permission === shouldEnable.value,
            )
          ) {
            return interaction.reply({
              content: oneLine`
                The \`${registryCommand.name}\` command is already ${
                shouldEnable.value ? 'enabled' : 'disabled'
              } in <#${targetChannel.channel.id}> (${targetChannel.channel.id})
              `,
              ephemeral: true,
            });
          }
          registryCommand.updatePermissions(interaction.inGuild() && interaction.guildId, [
            {
              id: targetChannel.channel.id,
              type: 'CHANNEL',
              permission: shouldEnable.value,
            },
          ]);
          return interaction.reply({
            content: oneLine`
              ${shouldEnable.value ? 'Enabled' : 'Disabled'} \`${registryCommand.name}\` command in <#${
              targetChannel.channel.id
            }> (${targetChannel.channel.id})
            `,
          });
        }
      }
    }
    return null;
  },
};
