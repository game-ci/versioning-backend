import { getDocumentFromUrl } from '../utils/get-document-from-url';
import { UnityVersionInfo } from '../../model/unityVersionInfo';

const UNITY_ARCHIVE_URL = 'https://unity3d.com/get-unity/download/archive';

/**
 * Based on https://github.com/BLaZeKiLL/unity-scraper
 */
export const scrapeVersionInfoFromUnity = async (): Promise<UnityVersionInfo[]> => {
  const document = await getDocumentFromUrl(UNITY_ARCHIVE_URL);

  const links = Array.from(document.querySelectorAll('a.unityhub[href]'));
  const hrefs = links.map((a) => a.getAttribute('href')) as string[];

  const versionInfoList = hrefs.map((href) => {
    const [version, changeSet] = href.split('/');
    const [major, minor, patch] = version.split('.');

    return {
      version,
      changeSet,
      major: Number(major),
      minor: Number(minor),
      patch,
    };
  });

  return versionInfoList;
};
