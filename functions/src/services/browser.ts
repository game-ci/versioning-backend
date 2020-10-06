import * as puppeteer from 'puppeteer';

const { firebase } = require('../shared');

export const getInstance = async () => {
  try {
    return await puppeteer.launch({
      args: ['--no-sandbox'],
    });
  } catch (e) {
    firebase.logger.error(e);
    throw e;
  }
};
