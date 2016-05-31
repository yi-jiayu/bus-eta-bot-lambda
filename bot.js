"use strict";

const fs = require('fs');
const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient({region: 'us-west-2'});
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
 * @prop {object} context - The context object provided by AWS Lambda
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
 * Output from the validate pipeline stage
 * @typedef {object} ValidateOutput
 * @prop {object} context - The context object provided by AWS Lambda
 * @prop {Telegram.Update} The original update object from Telegram
 */

/**
 * Validate the incoming update object
 * @param {Telegram.Update} update
 * @param {object} context
 * @returns {Promise.<ValidateOutput>}
 */
function validate(update, context) {
  context = context || {};

  return new Promise((resolve, reject) => {
    if (!update.hasOwnProperty('update_id')) throw new Error('invalid Telegram update');
    if (update.hasOwnProperty('edited_message')) update.message = update['edited_message'];
    if (!update.message.hasOwnProperty('text')) throw new Error('not a text message');

    docClient.put({
      TableName: 'BusEtaBot-lambda-message-history',
      Item: {
        chatid: update.message.chat.id,
        date: new Date().getTime(),
        awsRequestId: context.awsRequestId || 'LOCAL_TEST',
        functionVersion: context.functionVersion || 'LOCAL_TEST',
        incoming: update.message.text,
        userid: update.message.from.id,
        firstname: update.message.from.first_name
      }
    }, err => {
      if (err) debug('failed to save incoming message: ', err);
      else debug('saved incoming message');
    });

    resolve({context, update});
  });
}

/**
 * Output from the tokenise pipeline stage
 * @typedef {object} TokeniseOutput
 * @prop {Telegram.Update} update - The original update object from Telegram
 * @prop {string} command - The command extracted from the update text. May be null if no command was provided
 * @prop {string} args - The rest of the update text behind the command, or all the update text if no command was provided.
 */

/**
 * Tokenise the incoming update message text
 * @param {PipelineObj} pipelineObj
 * @returns {TokeniseOutput}
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
      return favourites(pipelineObj);
    case '/save':
      return save(pipelineObj);
    case '/delete':
      return deleteSavedQuery(pipelineObj);
    case '/redial':
      return redial(pipelineObj);
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
      docClient.put(params, err => {
        if (err) reject(new Error(err));
        else {
          debug(`saved state for user: ${JSON.stringify(pipelineObj.update.message.from)}`);
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
      busEtaResponse => {
        if (busEtaResponse.Services.length === 0) {
          pipelineObj.replyMethod = 'sendMessage';
          pipelineObj.replyParams = {
            chat_id: pipelineObj.update.message.chat.id,
            text: STRINGS.NoSvcsServingBusStop
          };
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
 * Send the user a keyboard to choose from a list of their saved eta requests
 * @param {PipelineObj} pipelineObj
 */
function favourites(pipelineObj) {
  pipelineObj.replyMethod = 'sendMessage';
  pipelineObj.replyParams = {
    chat_id: pipelineObj.update.message.chat.id,
    text: '(debug) send a keyboard with saved requests'
  };
  return pipelineObj;
}

/**
 * Allow the user to save a eta query for a specific bus stop and optional service and give it a name
 * @param {PipelineObj} pipelineObj
 */
function save(pipelineObj) {
  pipelineObj.replyMethod = 'sendMessage';
  pipelineObj.replyParams = {
    chat_id: pipelineObj.update.message.chat.id,
    text: '(debug) ask for a bus stop and optional service and a name to save the request as'
  };
  return pipelineObj;
}

/**
 * Send the user a keyboard to choose one of their saved eta requests to delete
 * @param {PipelineObj} pipelineObj
 */
function deleteSavedQuery(pipelineObj) {
  pipelineObj.replyMethod = 'sendMessage';
  pipelineObj.replyParams = {
    chat_id: pipelineObj.update.message.chat.id,
    text: '(debug) send a keyboard to select the saved request to be deleted'
  };
  return pipelineObj;
}

/**
 * repeat the last eta request
 * @param {PipelineObj} pipelineObj
 */
function redial(pipelineObj) {
  pipelineObj.replyMethod = 'sendMessage';
  pipelineObj.replyParams = {
    chat_id: pipelineObj.update.message.chat.id,
    text: '(debug) repeat the last eta request'
  };
  return pipelineObj;
}

/**
 * Create a message object to reply to the webhook with
 * @param {PipelineObj} pipelineObj
 // * @returns {PipelineObj}
 */
function sendReply(pipelineObj) {
  const method = pipelineObj.replyMethod;
  const params = pipelineObj.replyParams;

  if (typeof method === 'undefined' || typeof params === 'undefined')
    throw new Error('missing pipeline stages');

  pipelineObj.reply = new WebhookResponse(method, params);

  docClient.put({
    TableName: 'BusEtaBot-lambda-message-history',
    Item: {
      chatid: pipelineObj.update.message.chat.id,
      date: new Date().getTime(),
      awsRequestId: pipelineObj.context.awsRequestId || 'LOCAL_TEST',
      functionVersion: pipelineObj.context.functionVersion || 'LOCAL_TEST',
      outgoing: pipelineObj.replyParams.text
    }
  }, (err) => {
    if (err) debug('failed to save outgoing reply: ', err);
    else debug('saved outgoing reply');
  });

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
    docClient.get(params, (err, data) => {
      if (err) reject(new Error(err));
      else {
        debug(data);
        const Item = data.Item || {};
        const command = Item.command || null;
        switch (command) {
          case 'eta':
            resolve(eta(pipelineObj));
            break;
          default:
            const text = STRINGS.InvalidRequest;
            pipelineObj.replyMethod = 'sendMessage';
            pipelineObj.replyParams = {
              chat_id: chatId,
              text
            };
            resolve(pipelineObj);
        }
      }
    });
  });
}

exports.bot = function (update, context, callback) {
  console.log(JSON.stringify(update));

  validate(update, context)
    .then(tokenise)
    .then(sanitise)
    .then(execute)
    .then(sendReply)
    .then(pipelineObj => {
      callback(null, pipelineObj.reply);
    })
    .catch(err => {
      console.error(err);
      callback(err);
    });
};
