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

function validate(update) {
  if (update.hasOwnProperty('update_id')) {
    if (update.hasOwnProperty('message')) {
      return dispatch(parse(update));
    } else if (update.hasOwnProperty('edited_message')) {
      return Promise.reject('ERR_NOT_IMPLEMENTED');
    } else if (update.hasOwnProperty('callback_query')) {
      return handleCallbackQuery(update.callback_query);
    }
  }
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

function sanitise(cmd, rgs) {
  const command = cmd !== null
    ? cmd.replace(/@\w+/g, '').replace(/\s+/g, ' ').trim()
    : null;
  const args = rgs
    .replace(/@\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {command, args};
}

function parse(update) {
  const message = update.message;

  const messageId = message.message_id;
  const chatId = message.chat.id;
  const userId = message.from.id;

  const tokenised = tokenise(message);
  const sanitised = sanitise(tokenised.command, tokenised.args);
  const command = sanitised.command;
  const args = sanitised.args;

  return {
    update,
    messageId,
    chatId,
    userId,
    command,
    args
  };
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
  }
}

function handleCallbackQuery(query) {
  const data = JSON.parse(query.data);
  const message = query.message;
  const chatId = message.chat.id;
  const messageId = message.message_id;

  if (data.done) {
    const params = {
      TableName: 'BusEtaBot-lambda-message-cache-test',
      Key: {
        chat_id: chatId,
        message_id: messageId
      }
    };

    return docClient.get(params).promise()
      .then(result => {
        debug(result);
        const original = result.Item;
        const text = original.text;
        const options = original.options;

        delete options['reply_markup'];

        return editMessageText(chatId, messageId, text, options);
      });
  }
}

function editMessageText(chatId, messageId, text, options) {
  const edit = {
    chat_id: chatId,
    message_id: messageId,
    text
  };

  Object.keys(options).forEach(opt => edit[opt] = options[opt]);

  request.post({
    uri: BOT_ENDPOINT + 'editMessageText',
    json: true,
    body: edit
  });
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

function eta(req) {
  const args = req.args;
  const chatId = req.chatId;
  const userId = req.userId;
  const messageId = req.messageId;

  if (args.length == 0) {
    const params = {
      TableName: 'BusEtaBot-lambda-state',
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
        if (busEtaResponse.Services.length === 0) {
          return sendMessage(req, chatId, strings.NoSvcsServingBusStop);
        } else {
          const text = datamall.formatBusEtas(busStop, svcNo, busEtaResponse);
          const options = {
            parse_mode: 'HTML',
            reply_markup: JSON.stringify({
              inline_keyboard: [
                [{
                  text: 'Refresh',
                  callback_data: JSON.stringify({done: false, busStop, svcNo})
                }],
                [{
                  text: 'Done',
                  callback_data: JSON.stringify({done: true, chatId})
                }]
              ]
            })
          };

          return sendMessage(req, chatId, text, options);
        }
      });
  }
}

exports.bot = function (update, context, callback) {
  console.log(JSON.stringify(update));

  return validate(update)
    .then(() => callback())
    .catch(err => debug(err));
};

