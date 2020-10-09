import { getDocumentFromUrl } from '../utils/get-document-from-url';
import { VersionInfo } from '../model/versionInfo';

const UNITY_ARCHIVE_URL = 'https://unity3d.com/get-unity/download/archive';

/**
 * Based on https://github.com/BLaZeKiLL/unity-scraper
 */
export const getVersionInfoFromUnity = async (): Promise<VersionInfo[]> => {
  const document = await getDocumentFromUrl(UNITY_ARCHIVE_URL);

  const versionInfo = Array.from(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    document.querySelectorAll('.unityhub') as NodeListOf<HTMLAnchorElement>,
    (a) => {
      const link = a.href.replace('unityhub://', '');

      return {
        version: link.split('/')[0],
        changeSet: link.split('/')[1],
      };
    },
  );

  return versionInfo;
};
