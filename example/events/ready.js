module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    client.user.setPresence({
      status: 'online',
      activities: [{
        name: 'around with Discord.js',
        type: 'PLAYING'
      }]
    });
  }
};