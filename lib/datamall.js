"use strict";

const request = require('request');
const debug = require('debug')('BusEtaBot-lambda:datamall');

const LTA_API_URL = 'http://datamall2.mytransport.sg/ltaodataservice/';
const BUS_ETA_ENDPOINT = 'BusArrival';

/**
 * A response from the LTA Bus Arrival API
 * @typedef {object} BusEtaResponse
 * @prop {string} Metadata
 * @prop {string} BusStopID
 * @prop {ServiceInfo[]} Services
 */

/**
 * Information about a particular bus service
 * @typedef {object} ServiceInfo
 * @prop {string} ServiceNo
 * @prop {string} Status
 * @prop {string} Operator
 * @prop {string} OriginatingID
 * @prop {string} TerminatingID
 * @prop {ArrivingBusInfo} NextBus
 * @prop {ArrivingBusInfo} SubsequentBus
 * @prop {ArrivingBusInfo} SubsequentBus3
 */

/**
 * Information about an incoming bus
 * @typedef {object} ArrivingBusInfo
 * @prop {string} EstimatedArrival
 * @prop {string} Latitude
 * @prop {string} Longitude
 * @prop {string} VisitNumber
 * @prop {string} Load
 * @prop {string} Feature
 */

/**
 * Queries the LTA bus arrival API
 * @private
 * @param busStop
 * @param svcNo
 * @returns {Promise.<BusEtaResponse>}
 */
function fetchBusEtas(busStop, svcNo) {
  var options = {
    url: LTA_API_URL + BUS_ETA_ENDPOINT,
    headers: {
      AccountKey: process.env.LTA_DATAMALL_ACCOUNT_KEY,
      UniqueUserId: process.env.LTA_DATAMALL_USER_ID,
      accept: 'application/json'
    },
    qs: {
      BusStopID: busStop
    }
  };
  if (svcNo) {
    options.qs.ServiceNo = svcNo;
  }

  return new Promise((resolve, reject) => {
    request(options, (err, res, body) => {
      if (err) {
        debug(err);
        reject(err);
      } else resolve(JSON.parse(body));
    });
  });
}

/**
 * Calculate the estimated time of arrival in minutes for each service in the provided BusEtaResponse
 * @param {BusEtaResponse} busEtaResponse
 */
function calculateEtaMinutes(busEtaResponse) {
  const services = busEtaResponse.Services;
  const etas = [];
  for (const service of services) {
    if (service.Status === 'Not In Operation') etas.push({svcNo: service.ServiceNo, next: STRINGS.NotInOperation});
    else {
      const svcNo = service.ServiceNo;
      const MS_IN_A_MINUTE = 60 * 1000;
      const next = service.NextBus.EstimatedArrival !== ''
        ? Math.floor((new Date(service.NextBus.EstimatedArrival) - new Date()) / MS_IN_A_MINUTE)
        : '';
      const subsequent = service.SubsequentBus.EstimatedArrival != ''
        ? Math.floor((new Date(service.SubsequentBus.EstimatedArrival) - new Date()) / MS_IN_A_MINUTE)
        : '';
      const third = service.SubsequentBus3.EstimatedArrival != ''
        ? Math.floor((new Date(service.SubsequentBus3.EstimatedArrival) - new Date()) / MS_IN_A_MINUTE)
        : '';
      etas.push({svcNo, next, subsequent, third});
    }
  }
  return etas;
}

module.exports = {
  fetchBusEtas,
  calculateEtaMinutes
};
