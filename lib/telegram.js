"use strict";

/**
 * Namespace for Telegram objects
 * @namespace Telegram
 */

/**
 * This object represents a Telegram user or bot.
 * @typedef {object} Telegram.User
 * @prop {number} id
 * @prop {string} first_name - User‘s or bot’s first name
 * @prop {?string} last_name - User‘s or bot’s last name
 * @prop {?string} username - User‘s or bot’s username
 */

/**
 * This object represents a Telegram chat
 * @typedef {object} Telegram.Chat
 * @prop {number} id
 * @prop {string} type - Type of chat, can be either “private”, “group”, “supergroup” or “channel”
 * @prop {string} title - Title, for channels and group chats
 * @prop {?string} first_name - Username, for private chats, supergroups and channels if available
 * @prop {?string} last_name - First name of the other party in a private chat
 * @prop {?string} username - Last name of the other party in a private chat
 */

/**
 * This object represents one special entity in a text message. For example, hashtags, usernames, URLs, etc.
 * @typedef {object} Telegram.MessageEntity
 * @prop {string} type
 * @prop {number} offset
 * @prop {number} length
 */

/**
 * This object represents a Telegram message
 * @typedef {object} Telegram.Message
 * @prop {number} message_id
 * @prop {Telegram.User} from
 * @prop {number} date
 * @prop {Telegram.Chat} chat
 * @prop {string} text
 * @prop {Telegram.MessageEntity[]} entities
 */

/**
 * This object represents an incoming Telegram update
 * @typedef {object} Telegram.Update
 * @prop {number} update_id
 * @prop {Telegram.Message} message
 * @prop {Telegram.Message} edited_message
 */

/**
 * Class representing a webhook response.
 * @typedef {object} Telegram.WebhookResponse
 */
class WebhookResponse {
  /**
   * Create an object to be used as a response to a webhook to perform a request to the Bot API
   * @param {string} method - The method to be invoked
   * @param {object} params - Parameters for the method
   */
  constructor(method, params) {
    this.method = method;
    Object.keys(params).forEach(key => this[key] = params[key]);
  }
}

module.exports = {
  WebhookResponse
};
