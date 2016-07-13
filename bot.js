"use strict";

// load environment variables
const fs = require('fs');
const apiKeys = JSON.parse(fs.readFileSync('./.env.json'));
Object.keys(apiKeys).forEach(key => process.env[key] = apiKeys[key]);

const debug = require('debug')('BusEtaBot-lambda:bot');
const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient({region: 'us-west-2'});
const request = require('request');

const strings = require('./lib/strings');
const datamall = require('./lib/datamall');

const BOT_ENDPOINT = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/`;
const STATE_TABLE = process.env.STATE_TABLE;
const MESSAGE_CACHE_TABLE = process.env.MESSAGE_CACHE_TABLE;

function validate(req) {
  const update = req.update;

  return Promise.resolve()
    .then(() => {
      if (update.hasOwnProperty('update_id')) {
        if (update.hasOwnProperty('message')) {
          if (update.message.hasOwnProperty('text')) {
            return dispatch(parse(req));
          }
        } else if (update.hasOwnProperty('edited_message')) {
          if (update.edited_message.hasOwnProperty('text')) {
            return Promise.reject('ERR_NOT_IMPLEMENTED');
          }
        } else if (update.hasOwnProperty('callback_query')) {
          return handleCallbackQuery(req);
        }
      }
    });
}

function tokenise(message) {
  const text = message.text;
  const entities = message.entities || [];

  const commandEntity = entities.find(entity => entity.type === 'bot_command') || null;
  const command = commandEntity != null
    ? text.substr(commandEntity.offset, commandEntity.length)
    : null;
  const args = commandEntity != null
    ? text.substring(commandEntity.offset + commandEntity.length)
    : text;

  return {command, args};
}

function sanitise(command, args) {
  const sanitised = {};

  sanitised.command = command !== null
    ? command.replace(/@\w+/g, '').replace(/\s+/g, ' ').trim()
    : null;
  sanitised.args = args
    .replace(/@\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitised;
}

function parse(req) {
  const update = req.update;
  const message = update.message;

  const messageId = message.message_id;
  const chatId = message.chat.id;
  const userId = message.from.id;
  const group = message.chat.type === 'group';

  const tokenised = tokenise(message);
  const sanitised = sanitise(tokenised.command, tokenised.args);
  const command = sanitised.command;
  const args = sanitised.args;

  req.messageId = messageId;
  req.chatId = chatId;
  req.userId = userId;
  req.group = group;

  req.command = command;
  req.args = args;

  return req;
}

function dispatch(req) {
  const command = req.command;

  switch (command) {
    case '/eta':
      return eta(req);
    case '/favourites':
      break;
    case '/save':
      break;
    case '/delete':
      break;
    case '/redial':
      break;
    case null:
      return continueCommand(req);
    default:
      return invalidRequest(req);
  }
}

function invalidRequest(req) {
  if (req.group) return;

  const chatId = req.chatId;
  return sendMessage(req, chatId, 'Invalid! (Sorry, my replies will be more friendly in future, but I am only in beta for now.)');
}

function continueCommand(req) {
  const chatId = req.chatId;
  const userId = req.userId;

  const params = {
    TableName: STATE_TABLE,
    Key: {
      'chatid-userid-purpose': `${chatId}-${userId}-unfinished_command`
    }
  };

  return docClient.get(params).promise()
    .then(result => {
      if (result.hasOwnProperty('Item')) {
        switch (result.Item.command) {
          case 'eta':
            return eta(req)
              .then(() => docClient.delete(params).send());
        }
      } else return invalidRequest(req);
    });
}

function handleCallbackQuery(req) {
  const query = req.update.callback_query;

  if (!query.hasOwnProperty('message')) {
    return
  }

  const data = JSON.parse(query.data);
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;

  switch (data.t) {
    case 'eta':
      return handleEtaCallback(data, chatId, messageId);
  }
}

function handleEtaCallback(data, chatId, messageId) {
  if (data.d) {
    const params = {
      TableName: MESSAGE_CACHE_TABLE,
      Key: {
        chat_id: chatId,
        message_id: messageId
      }
    };

    return docClient.get(params).promise()
      .then(result => {
        const original = result.Item;
        const text = original.text;
        const options = original.options || {};

        delete options['reply_markup'];

        const res = {
          method: 'editMessageText',
          chat_id: chatId,
          message_id: messageId,
          text
        };

        Object.keys(options).forEach(opt => res[opt] = options[opt]);

        return res;
      });
  } else {
    const busStop = data.b;
    const svcNo = data.s;

    return datamall.fetchBusEtas(busStop, svcNo)
      .then(busEtaResponse => {
        const etas = getFormattedEtas(busStop, svcNo, busEtaResponse);
        const text = etas.text;
        const options = etas.options || {};

        const res = {
          method: 'editMessageText',
          chat_id: chatId,
          message_id: messageId,
          text
        };

        Object.keys(options).forEach(opt => res[opt] = options[opt]);

        return res;
      });
  }
}

function cacheReply(req, reply, text, options) {
  const params = {
    RequestItems: {
      'BusEtaBot-lambda-message-cache-test': [
        {
          PutRequest: {
            Item: {
              chat_id: req.chatId,
              message_id: req.messageId,
              direction: 'incoming',
              reply_chat_id: reply.chat.id,
              reply_message_id: reply.message_id
            }
          }
        },
        {
          PutRequest: {
            Item: {
              chat_id: reply.chat.id,
              message_id: reply.message_id,
              direction: 'outgoing',
              text,
              options
            }
          }
        }
      ]
    }
  };

  return docClient.batchWrite(params).promise();
}

function sendMessage(req, chatId, text, options) {
  const msg = {
    chat_id: chatId,
    text
  };

  options = options || {};
  Object.keys(options).forEach(opt => msg[opt] = options[opt]);

  return new Promise((resolve, reject) => {
    request.post({
        uri: BOT_ENDPOINT + 'sendMessage',
        json: true,
        body: msg
      },
      (err, resp, body) => {
        if (err) reject(err);
        else resolve({response: resp, body});
      });
  })
    .then(result => {
      if (result.response.statusCode === 200) {
        return cacheReply(req, result.body.result, text, options);
      } else {
        throw new Error(result.body.description);
      }
    })
    .catch(err => debug(err));
}

function getFormattedEtas(busStop, svcNo, busEtaResponse) {
  if (busEtaResponse.Services.length === 0) {
    return {text: strings.NoSvcsServingBusStop};
  } else return {
    text: datamall.formatBusEtas(busStop, svcNo, busEtaResponse),
    options: {
      parse_mode: 'HTML',
      reply_markup: JSON.stringify({
        inline_keyboard: [
          [{
            text: 'Refresh',
            callback_data: JSON.stringify({t: 'eta', d: false, b: busStop, s: svcNo})
          }],
          [{
            text: 'Done',
            callback_data: JSON.stringify({t: 'eta', d: true})
          }]
        ]
      })
    }
  };
}

function eta(req) {
  const args = req.args;
  const chatId = req.chatId;
  const userId = req.userId;

  if (args.length == 0) {
    if (req.group) return;

    const params = {
      TableName: STATE_TABLE,
      Item: {
        'chatid-userid-purpose': `${chatId}-${userId}-unfinished_command`,
        command: 'eta'
      }
    };

    return docClient.put(params).promise()
      .then(() => sendMessage(req, chatId, strings.SendBusStop));
  } else {
    const argv = args.split(' ');
    const busStop = argv[0];
    const svcNo = argv[1] || null;

    return datamall.fetchBusEtas(busStop, svcNo)
      .then(busEtaResponse => {
        const res = getFormattedEtas(busStop, svcNo, busEtaResponse);
        const text = res.text;
        const options = res.options;

        return sendMessage(req, chatId, text, options);
      });
  }
}

exports.bot = function (update, context, callback) {
  debug(JSON.stringify(update));

  const req = {update, context, callback};

  return validate(req)
    .then(res => callback(null, res))
    .catch(err => {
      debug(err);
      callback(err);
    });
};

