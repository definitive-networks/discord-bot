'use strict';

const { stripIndent } = require('common-tags');
const { Collection, ApplicationCommandManager } = require('discord.js');
const Command = require('./structures/Command');

class Registry {
  constructor(client) {
    Object.defineProperty(this, 'client', { value: client });

    this.commands = new Collection();
    
    this.commandsPath = null;
  }

  registerCommands(commands, ignoreInvalid = false) {
    if (!Array.isArray(commands)) throw new TypeError('Commands must be an Array.');
    for (const command of commands) {
      const valid = command instanceof Command || Command._validate(command);
      if (ignoreInvalid && !valid) {
        this.client.emit('warn', `Attempting to register an invalid command object: ${command}; skipping.`);
        continue;
      }
      this.registerCommand(command);
    }
    return this;
  }

  registerCommandsIn(directory) {
    const obj = require('require-all')({
      dirname: directory,
      filter: (fileName) => {
        if (!fileName.endsWith('.js')) return;
        return fileName;
      },
    });
    const commands = [];
    for (let command of Object.values(obj)) {
      commands.push(command);
    }
    this.commandsPath ??= directory;
    return this.registerCommands(commands, true);
  }
}