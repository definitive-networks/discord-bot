'use strict';

const { Util: DiscordUtil } = require('discord.js');

class Util extends DiscordUtil {
  static hasData(data, matchingData) {
    const matches = Object.keys(data)
      .map(key => matchingData[key] === data[key] || JSON.stringify(matchingData[key]) === JSON.stringify(data[key]))
      .filter(val => val === true);
      
    return Boolean(matches.length === Object.keys(data).length);
  };

  static inGuild(data) {
    return Boolean(data.guild && data.guild.id && data.member);
  }
}

module.exports = Util;