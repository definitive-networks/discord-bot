module.exports = {
  name: 'set',
  description: "Edit the bot's settings.",
  usage: '<setting> <value>',
  args: true,
  guildOnly: true,
  permissions: {
    member: ['BOT_OWNER', 'GUILD_OWNER', 'ADMINISTRATOR']
  },
  aliases: ['settings', 'config', 'conf'],
  execute(message, args, client) {
    switch(args[0]) {
      // Set prefix in guild example
      case ('prefix'): {
        if (args[1]) {
          client.database.guilds.set(`${message.guild.id}.prefix`, args[1]);
          message.channel.send(`Prefix updated: \`${args[1]}\``);
        } else {
          message.channel.send(`No prefix specified!`);
        }
        break;
      }
      // Enable command in guild example
      case ('enable'): {
        if (args[1] && client.commands.cache.has(args[1])) {
          client.database.guilds.set(`${message.guild.id}.${args[1]}`, true);
          message.channel.send(`Enabled command: \`${args[1]}\``);
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
          client.database.guilds.set(`${message.guild.id}.${args[1]}`, false);
          message.channel.send(`Disabled command: \`${args[1]}\``);
        } else {
          (args[1])
            ? message.channel.send('Command not found!')
            : message.channel.send('No command specified!');
        }
        break;
      }
    }
  }
};