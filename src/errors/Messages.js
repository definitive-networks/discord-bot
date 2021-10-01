'use strict';

const { register } = require('./BotError');

const Messages = {
  DIRECTORY_INVALID: dir => `${dir}`,
};

for (const [name, message] of Object.entries(Messages)) register(name, message);
