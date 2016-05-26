"use strict";

module.exports = {
  // profile: 'bus-eta-bot-lambda-user',
  region: 'us-west-2',
  handler: 'bot.bot',
  role: 'arn:aws:iam::776199111735:role/BusEtaBot-lambda-role',
  functionName: 'BusEtaBot-lambda',
  timeout: 60,
  memorySize: 128,
  publish: false, // default: false,
  runtime: 'nodejs' // default: 'nodejs'
};
