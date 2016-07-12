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
  "update_id": 103159945,
  "callback_query": {
    "id": "432549315321661696",
    "from": {
      "id": 100710735,
      "first_name": "Jiayu",
      "username": "yi_jiayu"
    },
    "message": {
      "message_id": 81,
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
      "date": 1468293698,
      "text": "Etas for bus stop 96049\nSvc    Inc. Buses\n2         8    18    19\n24        6    22    24\n5         0    18    34",
      "entities": [
        {
          "type": "pre",
          "offset": 24,
          "length": 89
        }
      ]
    },
    "data": "{\"done\":false,\"busStop\":\"96049\",\"svcNo\":null}"
  }
});
