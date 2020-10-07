import { Request } from 'firebase-functions/lib/providers/https';

const { firebase, functions } = require('./shared');
const { getDocumentFromUrl } = require('./utils/get-document-from-url');

/**
 * Based on https://github.com/BLaZeKiLL/unity-scraper
 */
export const ingest = functions.https.onRequest(async (request: Request, response: any) => {
  try {
    const archiveUrl = 'https://unity3d.com/get-unity/download/archive';

    const document = await getDocumentFromUrl(archiveUrl);
    const versionInfo = Array.from(
      document.querySelectorAll('.unityhub') as NodeListOf<HTMLAnchorElement>,
      (a) => {
        const link = a.href.replace('unityhub://', '');

        return {
          version: link.split('/')[0],
          changeset: link.split('/')[1],
        };
      },
    );

    response.send(versionInfo);
  } catch (err) {
    firebase.logger.error(err);
    response.send('Oops.');
  }
});
