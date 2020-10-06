import { Request } from 'firebase-functions/lib/providers/https';

const { firebase, functions } = require('./shared');
const Browser = require('./services/browser');

/**
 * Based on https://github.com/BLaZeKiLL/unity-scraper
 */
export const ingest = functions.https.onRequest(async (request: Request, response: any) => {
  const browser = await Browser.getInstance();

  try {
    const archiveUrl = 'https://unity3d.com/get-unity/download/archive';

    const page = await browser.newPage();
    await page.goto(archiveUrl);

    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a.unityhub[href]'), (a) => a.getAttribute('href')),
    );

    const versionInfo = hrefs.map((href: string) => {
      const link = href.replace('unityhub://', '');

      return {
        version: link.split('/')[0],
        changeset: link.split('/')[1],
      };
    });

    response.send(versionInfo);
  } catch (err) {
    firebase.logger.error(err);
    response.send('Oops.');
  } finally {
    await browser.close();
  }
});
