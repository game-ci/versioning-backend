import fetch, { RequestInfo } from 'node-fetch';
import { JSDOM } from 'jsdom';

export const getDocumentFromUrl = async (archiveUrl: RequestInfo) => {
  const response = await fetch(archiveUrl);
  const html = await response.text();

  return new JSDOM(html).window.document;
};
