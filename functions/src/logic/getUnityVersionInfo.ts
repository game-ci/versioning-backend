import { getDocumentFromUrl } from '../utils/get-document-from-url';

const UNITY_ARCHIVE_URL = 'https://unity3d.com/get-unity/download/archive';

/**
 * Based on https://github.com/BLaZeKiLL/unity-scraper
 */
export const getUnityVersionInfo = async () => {
  const document = await getDocumentFromUrl(UNITY_ARCHIVE_URL);

  const versionInfo = Array.from(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    document.querySelectorAll('.unityhub') as NodeListOf<HTMLAnchorElement>,
    (a) => {
      const link = a.href.replace('unityhub://', '');

      return {
        version: link.split('/')[0],
        changeset: link.split('/')[1],
      };
    },
  );

  return versionInfo;
};
