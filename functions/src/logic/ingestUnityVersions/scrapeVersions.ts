import { getDocumentFromUrl } from '../utils/get-document-from-url';
import { EditorVersionInfo } from '../../model/editorVersionInfo';

const UNITY_ARCHIVE_URL = 'https://unity.com/releases/editor/archive';
const unity_version_regex = /unityhub:\/\/(\d+)\.(\d+)\.(\d+[a-zA-Z]\d+)\/(\w+)/g;

export const scrapeVersions = async (): Promise<EditorVersionInfo[]> => {
  const document = await getDocumentFromUrl(UNITY_ARCHIVE_URL);

  const scripts = document.querySelectorAll('script');

  const allVersions = new Map<string, EditorVersionInfo>();

  for (const script of scripts) {
    if (script.textContent) {
      const matches = [...script.textContent.matchAll(unity_version_regex)];
      if (matches.length > 0) {
        const versions = matches
          .filter((match) => {
            // Filter out prerelease and unsupported versions
            const [_, major, minor, patch, changeSet] = match;
            return patch.includes('f') && Number(major) >= 2017;
          })
          .map((match) => {
            const [_, major, minor, patch, changeSet] = match;
            const version = `${major}.${minor}.${patch}`;
            if (!allVersions.has(version)) {
              return {
                version,
                changeSet,
                major: Number(major),
                minor: Number(minor),
                patch,
              };
            }

            // Return null if version is not unique
            return null;
          })
          .filter((version) => version !== null) as EditorVersionInfo[];

        versions.forEach((it) => {
          allVersions.set(it.version, it);
        });
      }
    }
  }

  if (allVersions.size > 0) {
    return Array.from(allVersions.values());
  }

  throw new Error('No Unity versions found!');
};
