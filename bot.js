"use strict";

// load environment variables
const apiKeys = require('./.env.json');
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

/**
 * Functional version of validate
 * @param req - Request to be validated
 * @returns {object} valid, type
 */
function fValidate(req) {
  const update = req.update;

  // updates from telegram must have an update_id field
  if (!update.hasOwnProperty('update_id')) {
    return {valid: false};
  }

  if (update.hasOwnProperty('message')) {
    if (update.hasOwnProperty('text')) {
      return {valid: true, type: 'txt_msg'};
    } else return {valid: false};
  }

  if (update.hasOwnProperty('edited_message')) {
    if (update.hasOwnProperty('text')) {
      return {valid: true, type: 'edited_txt_msg'};
    } else return {valid: false};
  }

  if (update.hasOwnProperty('callback_query')) {
    return {valid: true, type: 'cb_query'};
  }

  return {valid: false};
}

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

/**
 * Splits an incoming message into a command and arguments. If an incoming message does not contain a bot command,
 * the entire message text is treated as the arguments. Uses the message's entities field instead of parsing it on our
 * own.
 * @param message
 * @returns {{command: string|null, args: string}}
 */
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

/**
 * Removes tags, collapses whitespace and trims leading and trailing whitespace.
 * @param command
 * @param args
 * @returns {{command: string|null, args: string}}
 */
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

/**
 * Parses an incoming messages by tokenising and sanitising its content as well as extracting important attributes such
 * as the chat_id, message_id, user_id and whether the messages was from a group chat.
 * @param req
 * @returns {object}
 */
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

/**
 * Calls the appropriate handler for parsed incoming messages.
 * @param req
 */
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
      return redial(req);
    case null:
      return continueCommand(req);
    default:
      return invalidRequest(req);
  }
}

/**
 * Invalid request handler
 * @param req
 */
function invalidRequest(req) {
  // for now, don't send error messages if we're in a group chat
  if (req.group) return;

  const chatId = req.chatId;
  return sendMessage(req, chatId, 'Invalid! (Sorry, my replies will be more friendly in future, but I am only in beta for now.)');
}

/**
 * Handler for messages without a bot command
 * @param req
 * @returns {Promise}
 */
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

/**
 * Callback query handler, further delegates to specific handlers for each type of callback query.
 * @param req
 */
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

/**
 * Handler for eta callback queries
 * @param data
 * @param chatId
 * @param messageId
 * @returns {Promise.<TResult>}
 */
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

/**
 * Caches replies so that in future messages can be updated based on edited_message
 * @param req
 * @param reply
 * @param text
 * @param options
 */
function cacheReply(req, reply, text, options) {
  const params = {
    RequestItems: {
      [MESSAGE_CACHE_TABLE]: [
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

/**
 * Makes a HTTP request to the Telegram bot API to send a message
 * @param req
 * @param chatId
 * @param text
 * @param options
 * @returns {Promise}
 */
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

/**
 * Redial command handler
 * @param req
 * @returns {Promise}
 */
function redial(req) {
  const chatId = req.chatId;
  const userId = req.userId;

  const params = {
    TableName: STATE_TABLE,
    Key: {
      'chatid-userid-purpose': `${chatId}-${userId}-redial`
    }
  };

  return docClient.get(params).promise()
    .then(result => {
      if (!result.hasOwnProperty('Item')) {
        // there is no previous request to redial
        // fixme: also tell the user why the request is invalid
        return invalidRequest(req);
      } else {
        const busStop = result.Item.busStop;
        const svcNo = result.Item.svcNo;

        return _eta(req, chatId, busStop, svcNo);
      }
    });
}

/**
 * Eta command handler
 * @param req
 * @returns {Promise}
 */
function eta(req) {
  const args = req.args;
  const chatId = req.chatId;
  const userId = req.userId;

  if (args.length == 0) {
    // for now, don't allow two part queries if it's a group chat
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

    return _eta(req, chatId, busStop, svcNo)
      .then(() => {
        const params = {
          TableName: STATE_TABLE,
          Item: {
            'chatid-userid-purpose': `${chatId}-${userId}-redial`,
            busStop,
            svcNo
          }
        };

        docClient.put(params).send();
      });
  }
}

function _eta(req, chatId, busStop, svcNo) {
  return datamall.fetchBusEtas(busStop, svcNo)
    .then(busEtaResponse => {
      const res = getFormattedEtas(busStop, svcNo, busEtaResponse);
      const text = res.text;
      const options = res.options;

      return sendMessage(req, chatId, text, options);
    });
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

