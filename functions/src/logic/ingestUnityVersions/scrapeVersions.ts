import { getDocumentFromUrl } from '../utils/get-document-from-url';
import { EditorVersionInfo } from '../../model/editorVersionInfo';

const UNITY_ARCHIVE_URL = 'https://unity.com/releases/editor/archive';
const unity_version_regex = /unityhub:\/\/(\d+)\.(\d+)\.(\d+[a-zA-Z]\d+)\/(\w+)/g;

export const scrapeVersions = async (): Promise<EditorVersionInfo[]> => {
  const document = await getDocumentFromUrl(UNITY_ARCHIVE_URL);

  const scripts = document.querySelectorAll('script');

  for (const script of scripts) {
    if (script.textContent) {
      const matches = [...script.textContent.matchAll(unity_version_regex)];
      if (matches.length > 0) {
        return matches
          .filter((match) => {
            return match[3].includes('f');
          })
          .map((match) => {
            const [_, major, minor, patch, changeSet] = match;
            return {
              version: `${major}.${minor}.${patch}`,
              major: Number(major),
              minor: Number(minor),
              patch,
              changeSet,
            };
          });
      }
    }
  }

  throw new Error('No Unity versions found!');
};
