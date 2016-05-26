"use strict";

const fs = require('fs');
const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient({region: 'us-west-2'});
const debug = require('debug')('BusEtaBot-lambda:bot');
const leftPad = require('left-pad');

const datamall = require('./lib/datamall');
const WebhookResponse = require('./lib/telegram').WebhookResponse;

const STRINGS = require('./lib/strings');

// load environment variables
const apiKeys = JSON.parse(fs.readFileSync('./.env.json'));
Object.keys(apiKeys).forEach(key => process.env[key] = apiKeys[key]);

// function loadEnvironmentSecured() {
//   return new Promise((resolve, reject) => {
//     const kms = new AWS.KMS({region: 'us-west-2'});
//     const encryptedApiKeys = fs.readFileSync('./.env');
//     const encryptedApiKeysBin = new Buffer(encryptedApiKeys.toString(), 'base64');
//     const decryptionParams = {CiphertextBlob: encryptedApiKeysBin};
//
//     kms.decrypt(decryptionParams, (err, data) => {
//       if (err) reject(new Error(err));
//       else {
//         const apiKeys = data.Plaintext.toString();
//         resolve(apiKeys);
//       }
//     });
//   });
// }

/**
 *
 * @typedef {object} PipelineObj
 * @prop {Telegram.Update} update - The original update object from Telegram
 * @prop {?string} command - The command extracted from the update text. May be null if no command was provided
 * @prop {?string} args - The rest of the update text behind the command, or all the update text if no command was provided.
 * @prop {?string} replyMethod - The Bot API method to be invoked in the webhook response
 * @prop {?object} replyParams - The parameters to be sent with the webhook response
 * @prop {?string} replyText - The reply message text to be sent in the response to the Telegram update
 * @prop {?object} replyOptions - Options to be sent with the reply message
 * @prop {?Telegram.WebhookResponse} reply
 */

/**
 * Valid the incoming update object
 * @param {Telegram.Update} update
 * @returns {Promise.<PipelineObj>}
 */
function validate(update) {
  return new Promise(resolve => {
    if (!update.hasOwnProperty('update_id')) throw new Error('invalid Telegram update');
    if (update.hasOwnProperty('edited_message')) update.message = update['edited_message'];
    if (!update.message.hasOwnProperty('text')) throw new Error('not a text message');
    resolve({update});
  });
}

/**
 * Tokenise the incoming update message text
 * @param {PipelineObj} pipelineObj
 * @returns {PipelineObj}
 */
function tokenise(pipelineObj) {
  const text = pipelineObj.update.message.text;
  const entities = pipelineObj.update.message.entities || [];
  const commandEntity = entities.find(entity => entity.type === 'bot_command') || null;
  const command = commandEntity != null
    ? text.substr(commandEntity.offset, commandEntity.length)
    : null;
  const args = commandEntity != null
    ? text.substring(commandEntity.offset + commandEntity.length)
    : text;
  pipelineObj.command = command;
  pipelineObj.args = args;
  return pipelineObj;
}

/**
 * Removes tags and collapses whitespace from the extracted command and args
 * @param {PipelineObj} pipelineObj
 * @returns {PipelineObj}
 */
function sanitise(pipelineObj) {
  const command = pipelineObj.command !== null
    ? pipelineObj.command
    .replace(/@\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    : null;
  const args = pipelineObj.args
    .replace(/@\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  pipelineObj.command = command;
  pipelineObj.args = args;
  return pipelineObj;
}

/**
 * Execute the incoming command, or try to continue an unfinished request if no command was provided
 * @param {PipelineObj} pipelineObj
 */
function execute(pipelineObj) {
  switch (pipelineObj.command) {
    case '/eta':
      return eta(pipelineObj);
    case '/favourites':
    case '/save':
    case '/delete':
    case '/edit':
    case null:
      return continueCommand(pipelineObj);
    default:
      throw new Error('invalid command');
  }
}

/**
 * Try to fetch bus etas if arguments were given, otherwise respond asking for arguments.
 * @param {PipelineObj} pipelineObj
 * @returns {Promise.<PipelineObj>}
 */
function eta(pipelineObj) {
  if (pipelineObj.args === '') {
    const chatId = pipelineObj.update.message.chat.id;
    const userId = pipelineObj.update.message.from.id;
    const params = {
      TableName: 'BusEtaBot-lambda-state',
      Item: {
        'chatid-userid-purpose': `${chatId}-${userId}-unfinished_command`,
        command: 'eta'
      }
    };

    return new Promise((resolve, reject) => {
      dynamoDb.put(params, (err, data) => {
        if (err) reject(new Error(err));
        else {
          debug(`stored ${JSON.stringify(data)} to dynamodb`);
          pipelineObj.replyMethod = 'sendMessage';
          pipelineObj.replyParams = {
            chat_id: chatId,
            text: STRINGS.SendBusStop
          };
          resolve(pipelineObj);
        }
      });
    });
  } else {
    const argv = pipelineObj.args.split(' ');
    const busStop = argv[0];    //
    const svcNo = argv[1];      // no destructuring assignment in node 4.3.2 ):

    return datamall.fetchBusEtas(busStop, svcNo).then(
      (busEtaResponse) => {
        if (busEtaResponse.Services.length === 0) {
          pipelineObj.replyText = STRINGS.NoSvcsServingBusStop;
          return pipelineObj;
        } else {
          const etas = datamall.calculateEtaMinutes(busEtaResponse);
          let replyText = 'Svc    Inc. Buses';
          for (const service of etas) {
            const svcNoPadded = '\n' + service.svcNo + ' '.repeat(7 - service.svcNo.length);
            replyText += svcNoPadded
              + leftPad(service.next, 6)
              + leftPad(service.subsequent || '', 6)
              + leftPad(service.third || '', 6);
          }
          replyText = `<pre>${replyText}</pre>`;

          pipelineObj.replyMethod = 'sendMessage';
          pipelineObj.replyParams = {
            chat_id: pipelineObj.update.message.chat.id,
            text: replyText,
            parse_mode: 'HTML'
          };
          return pipelineObj;
        }
      });
  }
}

/**
 * Create a message object to reply to the webhook with
 * @param {PipelineObj} pipelineObj
 * @returns {PipelineObj}
 */
function createReply(pipelineObj) {
  const method = pipelineObj.replyMethod;
  const params = pipelineObj.replyParams;

  if (typeof method === 'undefined' || typeof params === 'undefined')
    throw new Error('missing pipeline stages');

  pipelineObj.reply = new WebhookResponse(method, params);
  return pipelineObj;
}

/**
 * Tries to resume an unfinished command based on a user's saved state
 * @param {PipelineObj} pipelineObj
 */
function continueCommand(pipelineObj) {
  const chatId = pipelineObj.update.message.chat.id;
  const userId = pipelineObj.update.message.from.id;
  const params = {
    TableName: 'BusEtaBot-lambda-state',
    Key: {
      'chatid-userid-purpose': `${chatId}-${userId}-unfinished_command`
    }
  };

  return new Promise((resolve, reject) => {
    dynamoDb.get(params, (err, data) => {
      if (err) reject(new Error(err));
      else {
        debug(data.Item);
        pipelineObj.replyMethod = 'sendMessage';
        pipelineObj.replyParams = {
          chat_id: chatId,
          text: `(not implemented) You are in the middle of an ${data.Item.command} request.`
        };
        resolve(pipelineObj);
      }
    });
  });
}

exports.bot = function (event, context, callback) {
  console.log(JSON.stringify(event));

  validate(event)
    .then(tokenise)
    .then(sanitise)
    .then(execute)
    .then(createReply)
    .then(pipelineObj => {
      callback(null, pipelineObj.reply);
    })
    .catch(err => {
      console.error(err);
      callback(err);
    });
};
