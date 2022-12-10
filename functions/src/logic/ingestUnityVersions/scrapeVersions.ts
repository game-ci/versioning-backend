import { getDocumentFromUrl } from '../utils/get-document-from-url';
import { EditorVersionInfo } from '../../model/editorVersionInfo';

const UNITY_ARCHIVE_URL = 'https://unity.com/releases/editor/archive';

/**
 * Based on https://github.com/BLaZeKiLL/unity-scraper
 */
export const scrapeVersions = async (): Promise<EditorVersionInfo[]> => {
  const document = await getDocumentFromUrl(UNITY_ARCHIVE_URL);

  const links = Array.from(document.querySelectorAll('.release-links div:first-child a[href]'));
  const hrefs = links.map((a) => a.getAttribute('href')) as string[];

  const versionInfoList = hrefs.map((href) => {
    const info = href.replace('unityhub://', '');
    const [version, changeSet] = info.split('/');
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
