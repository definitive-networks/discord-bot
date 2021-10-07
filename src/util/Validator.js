'use strict';

const Joi = require('joi');

const commandSchema = Joi.object({
  type: Joi.string().default('CHAT_INPUT').valid('CHAT_INPUT', 'USER', 'MESSAGE'),
  name: Joi.string()
    .min(1)
    .max(32)
    .required()
    .when('type', {
      is: 'USER' || 'MESSAGE',
      then: Joi.string().pattern(/([\w](-| )?)*[\w]+/),
      otherwise: Joi.string()
        .lowercase()
        .pattern(/[\w-]+/),
    }),
  description: Joi.string().when('type', {
    is: 'USER' || 'MESSAGE',
    then: Joi.string().allow('').valid(''),
    otherwise: Joi.string().min(1).max(100),
  }),
  args: [Joi.function(), Joi.array().max(25)],
  guildIds: [Joi.string(), Joi.array().items(Joi.string())],
  requiredPermissions: Joi.object({
    member: Joi.array().items(Joi.string()),
    channel: Joi.array().items(Joi.string()),
  }),
  throttler: Joi.object({
    duration: Joi.number(),
    usages: Joi.number(),
  }),
  deferEphemeral: Joi.boolean().default(false),
  defaultPermission: Joi.boolean().default(true),
  permissions: Joi.object(),
  execute: Joi.function().required(),
}).unknown(true);

const eventSchema = Joi.object({
  name: Joi.string().required(),
  once: Joi.boolean(),
  execute: Joi.function().required(),
});

const interactionSchema = Joi.object({
  name: Joi.string(),
  customId: Joi.string(),
  execute: Joi.function().required(),
});

class Validator {
  static isCommand(data) {
    return commandSchema.validate(data);
  }

  static isEvent(data) {
    return eventSchema.validate(data);
  }

  static isInteraction(data) {
    return interactionSchema.validate(data);
  }
}

module.exports = Validator;
