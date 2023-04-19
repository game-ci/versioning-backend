import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

export const getDocumentFromUrl = async (archiveUrl: string) => {
  const response = await fetch(archiveUrl);
  const html = await response.text();

  return new JSDOM(html).window.document;
};
