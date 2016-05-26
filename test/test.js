"use strict";

const debug = require('debug')('BusEtaBot-lambda:test');
const assert = require('chai').assert;

const bot = require('../bot').bot;
const WebhookResponse = require('../lib/telegram').WebhookResponse;

const STRINGS = require('../lib/strings');

suite('Group chats', function() {
  test('New chat member', function (done) {
    const update = {
      "update_id": 0,
      "message": {
        "message_id": 0,
        "from": {
          "id": 0,
          "first_name": "TEST_USER",
          "username": "TEST_USER"
        },
        "chat": {
          "id": 0,
          "title": "GROUP_TITLE",
          "type": "group"
        },
        "date": 0,
        "new_chat_participant": {
          "id": 0,
          "first_name": "Bus Eta Bot",
          "username": "TEST_USER"
        },
        "new_chat_member": {
          "id": 0,
          "first_name": "Bus Eta Bot",
          "username": "TEST_USER"
        }
      }
    };

    bot(update, {}, function(err, response) {
      if (err) console.error(err);
      else console.log(response);

      // assert.instanceOf(response, WebhookResponse, 'response should be a WebhookResponse');
      // assert.strictEqual(response.text, STRINGS.SendBusStop, 'response should be a request for a bus stop');

      done();
    });
  });

  test('Left chat member', function(done) {
    const update = {
      "update_id": 0,
      "message": {
        "message_id": 0,
        "from": {
          "id": 0,
          "first_name": "TEST_USER",
          "username": "TEST_USER"
        },
        "chat": {
          "id": 0,
          "title": "GROUP_TITLE",
          "type": "group"
        },
        "date": 0,
        "left_chat_participant": {
          "id": 0,
          "first_name": "Bus Eta Bot",
          "username": "TEST_USER"
        },
        "left_chat_member": {
          "id": 0,
          "first_name": "Bus Eta Bot",
          "username": "TEST_USER"
        }
      }
    };

    bot(update, {}, function(err, response) {
      if (err) console.error(err);
      else console.log(response);

      // assert.instanceOf(response, WebhookResponse, 'response should be a WebhookResponse');
      // assert.strictEqual(response.text, STRINGS.SendBusStop, 'response should be a request for a bus stop');

      done();
    });
  });

  test('Valid eta command in group chat', function (done) {
    const update = {
      "update_id": 0,
      "message": {
        "message_id": 0,
        "from": {
          "id": 0,
          "first_name": "TEST_USER",
          "username": "TEST_USER"
        },
        "chat": {
          "id": 0,
          "title": "GROUP_TITLE",
          "type": "group"
        },
        "date": 0,
        "text": "/eta 96049",
        "entities": [
          {
            "type": "bot_command",
            "offset": 0,
            "length": 4
          }
        ]
      }
    };

    bot(update, {}, function(err, response) {
      if (err) console.error(err);
      else console.log(response);

      // assert.instanceOf(response, WebhookResponse, 'response should be a WebhookResponse');
      // assert.strictEqual(response.text, STRINGS.SendBusStop, 'response should be a request for a bus stop');

      done();
    });
  });

  test('Invalid command in group chat', function (done) {
    const update = {
      "update_id": 0,
      "message": {
        "message_id": 0,
        "from": {
          "id": 0,
          "first_name": "TEST_USER",
          "username": "TEST_USER"
        },
        "chat": {
          "id": 0,
          "title": "GROUP_TITLE",
          "type": "group"
        },
        "date": 0,
        "text": "/get lunch",
        "entities": [
          {
            "type": "bot_command",
            "offset": 0,
            "length": 4
          }
        ]
      }
    };

    bot(update, {}, function(err, response) {
      if (err) console.error(err);
      else console.log(response);

      // assert.instanceOf(response, WebhookResponse, 'response should be a WebhookResponse');
      // assert.strictEqual(response.text, STRINGS.SendBusStop, 'response should be a request for a bus stop');

      done();
    });
  });
});

suite('/eta', function () {
  this.timeout(5000);

  test('Without arguments', function (done) {
    const update = {
      "update_id": 0,
      "message": {
        "message_id": 0,
        "from": {
          "id": 0,
          "first_name": "TEST_USER"
        },
        "chat": {
          "id": 0,
          "first_name": "TEST_USER",
          "type": "private"
        },
        "date": 0,
        "text": "/eta",
        "entities": [
          {
            "type": "bot_command",
            "offset": 0,
            "length": 4
          }
        ]
      }
    };

    bot(update, {}, function(err, response) {
      if (err) console.error(err);
      else debug(response);

      assert.instanceOf(response, WebhookResponse, 'response should be a WebhookResponse');
      assert.strictEqual(response.text, STRINGS.SendBusStop, 'response should be a request for a bus stop');

      done();
    });
  });

  test('Valid bus stop only', function (done) {
    const update = {
      "update_id": 0,
      "message": {
        "message_id": 0,
        "from": {
          "id": 0,
          "first_name": "TEST_USER",
          "username": "TEST_USER"
        },
        "chat": {
          "id": 0,
          "first_name": "TEST_USER",
          "username": "TEST_USER",
          "type": "private"
        },
        "date": 0,
        "text": "/eta 96049",
        "entities": [
          {
            "type": "bot_command",
            "offset": 0,
            "length": 4
          }
        ]
      }
    };

    bot(update, {}, function(err, response) {
      if (err) console.error(err);
      else debug(response);

      assert.instanceOf(response, WebhookResponse, 'response should be a WebhookResponse');
      assert.match(response.text, /^<pre>Svc    Inc. Buses/, 'response text should be a header for bus etas');

      done();
    });
  });

  test('Valid bus stop and service', function (done) {
    const update = {
      "update_id": 0,
      "message": {
        "message_id": 0,
        "from": {
          "id": 0,
          "first_name": "TEST_USER",
          "username": "TEST_USER"
        },
        "chat": {
          "id": 0,
          "first_name": "TEST_USER",
          "username": "TEST_USER",
          "type": "private"
        },
        "date": 0,
        "text": "/eta 96049 24",
        "entities": [
          {
            "type": "bot_command",
            "offset": 0,
            "length": 4
          }
        ]
      }
    };

    bot(update, {}, function(err, response) {
      if (err) done(err);
      else debug(response);

      assert.instanceOf(response, WebhookResponse, 'response should be a WebhookResponse');
      assert.match(response.text, /^<pre>Svc    Inc. Buses/, 'response text should be a header for bus etas');

      done();
    });
  });
});
