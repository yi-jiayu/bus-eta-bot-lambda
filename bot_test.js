"use strict";

const bot = require('./bot');

// bot.bot({
//   "update_id": 745871264,
//   "message": {
//     "message_id": 323,
//     "from": {
//       "id": 100710735,
//       "first_name": "Jiayu",
//       "username": "yi_jiayu"
//     },
//     "chat": {
//       "id": 100710735,
//       "first_name": "Jiayu",
//       "username": "yi_jiayu",
//       "type": "private"
//     },
//     "date": 1468224494,
//     "text": "/eta 96049",
//     "entities": [
//       {
//         "type": "bot_command",
//         "offset": 0,
//         "length": 4
//       }
//     ]
//   }
// });

bot.bot({
  "update_id": 103159930,
  "callback_query": {
    "id": "432549313921542708",
    "from": {
      "id": 100710735,
      "first_name": "Jiayu",
      "username": "yi_jiayu"
    },
    "message": {
      "message_id": 69,
      "from": {
        "id": 187530042,
        "first_name": "DevBuildBusEtaBot",
        "username": "DevBuildBusEtaBot"
      },
      "chat": {
        "id": 100710735,
        "first_name": "Jiayu",
        "username": "yi_jiayu",
        "type": "private"
      },
      "date": 1468253765,
      "text": "Etas for bus stop 96049\n24         12            \n2      Not in operation            \n5      Not in operation",
      "entities": [
        {
          "type": "pre",
          "offset": 24,
          "length": 85
        }
      ]
    },
    "data": "{\"done\":true,\"chatId\":100710735}"
  }
});
