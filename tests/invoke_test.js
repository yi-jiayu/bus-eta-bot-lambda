"use strict";

const AWS = require('aws-sdk');
const awsLambda = new AWS.Lambda({region: 'us-west-2'});

function invoke(payload) {
  const params = {
    FunctionName: 'BusEtaBot-lambda',
    Payload: payload,
    Qualifier: 'STRING_VALUE'
  };
  awsLambda.invoke(params, function(err, data) {
    if (err) console.log(err, err.stack); // an error occurred
    else     console.log(data);           // successful response
  });
}

function main() {
  invoke(JSON.stringify({}));
}

if (require.main === module) main();
