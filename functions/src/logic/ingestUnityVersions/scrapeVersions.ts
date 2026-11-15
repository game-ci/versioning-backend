import { EditorVersionInfo } from '../../model/editorVersionInfo';
import { searchChangesets, SearchMode } from 'unity-changeset';
import fetch from 'node-fetch';

const unity_version_regex = /^(\d+)\.(\d+)\.(\d+)([a-zA-Z]+)(-?\d+)$/;
const unity_whats_new_url = 'https://unity.com/releases/editor/whats-new';

type UnityChangesetVersion = {
  version: string;
  changeset: string;
};

const toEditorVersionInfo = (unityVersion: UnityChangesetVersion): EditorVersionInfo | null => {
  const match = RegExp(unity_version_regex).exec(unityVersion.version);
  if (!match) {
    return null;
  }

  const [_, major, minor, patch, lifecycle] = match;

  if (lifecycle !== 'f' || Number(major) < 2017) {
    return null;
  }

  return {
    version: unityVersion.version,
    changeSet: unityVersion.changeset,
    major: Number(major),
    minor: Number(minor),
    patch,
  } as EditorVersionInfo;
};

export const scrapeRecentOfficialUnityVersions = async (): Promise<EditorVersionInfo[]> => {
  const response = await fetch(unity_whats_new_url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'game-ci-versioning-backend/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Unity release page returned ${response.status}`);
  }

  const html = await response.text();
  const versions: UnityChangesetVersion[] = [];
  const processedVersions = new Set<string>();

  const versionRegex = /(\d+\.\d+\.\d+f\d+)/g;
  let match;
  while ((match = versionRegex.exec(html)) !== null) {
    const version = match[1];
    if (processedVersions.has(version)) continue;
    processedVersions.add(version);

    const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let changeset: string | undefined;

    const changesetMatch =
      new RegExp(`unityhub://${escapedVersion}/([a-f0-9]{12})`, 'i').exec(html) ||
      new RegExp(`${escapedVersion}[^a-f0-9]*([a-f0-9]{12})`, 'i').exec(html);

    if (changesetMatch?.[1]) {
      changeset = changesetMatch[1];
    } else {
      // As a last resort, search for changeset within a context window near the version
      // Extract ~500 chars around the version match for local context search
      const versionIndex = html.indexOf(version);
      if (versionIndex !== -1) {
        const contextStart = Math.max(0, versionIndex - 200);
        const contextEnd = Math.min(html.length, versionIndex + 300);
        const context = html.substring(contextStart, contextEnd);
        const contextChangesetMatch = /[Cc]hangeset:\s*([a-f0-9]{12})/i.exec(context);
        if (contextChangesetMatch?.[1]) {
          changeset = contextChangesetMatch[1];
        }
      }
    }

    if (changeset) {
      versions.push({
        version,
        changeset,
      });
    }
  }

  return versions
    .map(toEditorVersionInfo)
    .filter((versionInfo): versionInfo is EditorVersionInfo => versionInfo !== null);
};

export const scrapeLatestOfficialUnityVersion = async (): Promise<EditorVersionInfo | null> => {
  const recentVersions = await scrapeRecentOfficialUnityVersions();
  return recentVersions.length > 0 ? recentVersions[0] : null;
};

export const scrapeVersions = async (): Promise<EditorVersionInfo[]> => {
  const unityVersions: UnityChangesetVersion[] = (await searchChangesets(SearchMode.Default)).map(
    ({ version, changeset }) => ({
      version,
      changeset,
    }),
  );
  const unityXltsVersions: UnityChangesetVersion[] = (await searchChangesets(SearchMode.XLTS)).map(
    ({ version, changeset }) => ({
      version,
      changeset,
    }),
  );
  const recentOfficialVersions = await scrapeRecentOfficialUnityVersions();

  // Merge XLTS versions into main list, avoiding duplicates
  const existingVersions = new Set(unityVersions.map((v) => v.version));
  for (const xltsVersion of unityXltsVersions) {
    if (!existingVersions.has(xltsVersion.version)) {
      unityVersions.push(xltsVersion);
      existingVersions.add(xltsVersion.version);
    }
  }

  // Merge recent official versions discovered from Unity releases page
  for (const officialVersion of recentOfficialVersions) {
    if (!existingVersions.has(officialVersion.version)) {
      unityVersions.push({
        version: officialVersion.version,
        changeset: officialVersion.changeSet,
      });
      existingVersions.add(officialVersion.version);
    }
  }

  if (unityVersions?.length > 0) {
    return unityVersions
      .map(toEditorVersionInfo)
      .filter((versionInfo): versionInfo is EditorVersionInfo => versionInfo !== null);
  }

  throw new Error('No Unity versions found!');
};
