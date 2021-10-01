'use strict';

// Credit: https://github.com/discordjs/discord.js/blob/00bd92a45172852c9dd20550eb916c101668071c/src/errors/DJSError.js

const kCode = Symbol('code');
const messages = new Map();

function makeDiscordBotError(Base) {
  return class DiscordBotError extends Base {
    constructor(key, ...args) {
      super(message(key, args));
      this[kCode] = key;
      if (Error.captureStackTrace) Error.captureStackTrace(this, DiscordBotError);
    }

    get name() {
      return `${super.name} [${this[kCode]}]`;
    }

    get code() {
      return this[kCode];
    }
  };
}

function message(key, args) {
  if (typeof key !== 'string') throw new Error('Error message key must be a string');
  const msg = messages.get(key);
  if (!msg) throw new Error(`An invalid error message key was used: ${key}.`);
  if (typeof msg === 'function') return msg(...args);
  if (!args?.length) return msg;
  args.unshift(msg);
  return String(...args);
}

function register(sym, val) {
  messages.set(sym, typeof val === 'function' ? val : String(val));
}

module.exports = {
  register,
  Error: makeDiscordBotError(Error),
  TypeError: makeDiscordBotError(TypeError),
  RangeError: makeDiscordBotError(RangeError),
};
