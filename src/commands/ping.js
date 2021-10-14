'use strict';

const { oneLine } = require('common-tags');

module.exports = {
  name: 'ping',
  description: "Check the bot's ping to the Discord server.",
  // guildIds: ['all'],
  requiredPermissions: {
    channel: ['VIEW_CHANNEL', 'SEND_MESSAGES'],
  },
  permissions: {
    '429077454636974090': [
      {
        id: '713086433086144532',
        type: 'CHANNEL',
        permission: false,
      },
    ],
  },
  throttler: {
    usages: 5,
    duration: 10,
  },
  execute: async (interaction, client) => {
    const pingMsg = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    return pingMsg.edit(oneLine`
      Pong! The message round-trip took ${
        (pingMsg.editedTimestamp || pingMsg.createdTimestamp) - interaction.createdTimestamp
      }ms.
      ${client.ws.ping ? `The heartbeat ping is ${Math.round(client.ws.ping)}ms.` : ``}
    `);
  },
};
