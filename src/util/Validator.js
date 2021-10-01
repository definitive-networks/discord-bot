'use strict';

const Ajv = require('ajv');
const Validator = new Ajv({
  keywords: [require('ajv-keywords/dist/definitions/transform')(), require('ajv-keywords/dist/definitions/typeof')()],
});

Validator.addSchema(
  {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 32 },
      description: { type: 'string', maxLength: 100 },
      type: { type: 'string' },
      guilds: {
        type: 'array',
        uniqueItems: true,
        items: [{ type: 'string' }],
      },
      defaultPermission: { type: 'boolean' },
      permissions: {
        type: 'object',
        properties: {
          users: {
            type: 'array',
            uniqueItems: true,
            items: [{ type: 'string' }],
          },
          roles: {
            type: 'array',
            uniqueItems: true,
            items: [{ type: 'string' }],
          },
          channels: {
            type: 'array',
            uniqueItems: true,
            items: [{ type: 'string' }],
          },
        },
      },
      requiredPerms: {
        type: 'object',
        properties: {
          member: {
            type: 'array',
            uniqueItems: true,
            items: [{ type: 'string' }],
          },
          channel: {
            type: 'array',
            uniqueItems: true,
            items: [{ type: 'string' }],
          },
        },
      },
      execute: { typeof: 'function' },
    },
    required: ['name', 'execute'],
    if: { properties: { type: { pattern: 'USER|MESSAGE' } } },
    then: {
      properties: {
        name: { pattern: '([w](-| )?)*[w]+' },
      },
    },
    else: {
      properties: {
        name: { transform: ['toLowerCase'], pattern: '[w-]+' },
      },
    },
    additionalProperties: true,
  },
  'command',
);

Validator.isCommand = Validator.getSchema('command');

Validator.isEvent = data => {
  switch (true) {
    case data:
    case data.name && typeof data.name === 'string':
    case data.execute && typeof data.execute === 'function':
    case !data.once || (data.once && typeof data.once === 'boolean'): {
      return true;
    }
    default: {
      return false;
    }
  }
};

Validator.isInteraction = data => data?.execute && typeof data.execute === 'function';

module.exports = Validator;
