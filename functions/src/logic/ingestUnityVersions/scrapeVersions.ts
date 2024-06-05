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
        const uniqueVersions = new Set<string>();
        return matches
          .filter((match) => {
            // Filter out prerelease versions
            return match[3].includes('f');
          })
          .map((match) => {
            const [_, major, minor, patch, changeSet] = match;
            const version = `${major}.${minor}.${patch}`;
            if (!uniqueVersions.has(version)) {
              uniqueVersions.add(version);
              return {
                version,
                changeSet,
                major: Number(major),
                minor: Number(minor),
                patch,
              };
            }
            return null;
          })
          .filter((version) => version !== null) as EditorVersionInfo[];
      }
    }
  }

  throw new Error('No Unity versions found!');
};
