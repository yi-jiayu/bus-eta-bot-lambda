"use strict";

const bot = require('../bot').bot;

const withoutArgs = {
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

const update = withoutArgs;

function main() {
  if (process.argv.length < 3) {
    bot(update, {}, (err, res) => {
      if (err) console.error(err);
      else console.log(res);
    });
  } else {
    bot(process.argv[2], {}, (err, res) => {
      if (err) console.error(err);
      else console.log(res);
    });
  }
}

if (require.main == module) {
  main();
}
