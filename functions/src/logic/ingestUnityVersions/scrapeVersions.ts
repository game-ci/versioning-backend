import { EditorVersionInfo } from '../../model/editorVersionInfo';
import { searchChangesets, SearchMode } from 'unity-changeset';
import fetch from 'node-fetch';

const unity_version_regex = /^(\d+)\.(\d+)\.(\d+)([a-zA-Z]+)(-?\d+)$/;
const unity_whats_new_url = 'https://unity.com/releases/editor/whats-new';

type UnityChangesetVersion = {
  version: string;
  changeset: string;
};

const toEditorVersionInfo = (
  unityVersion: UnityChangesetVersion,
): EditorVersionInfo | null => {
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

export const scrapeLatestOfficialUnityVersion =
  async (): Promise<EditorVersionInfo | null> => {
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
    const versionMatch = /Unity\s+(\d+\.\d+\.\d+f\d+)/.exec(html);
    const escapedVersion = versionMatch?.[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const changesetMatch = versionMatch
      ? new RegExp(
          `unityhub://${escapedVersion}/([a-f0-9]{12})`,
          'i',
        ).exec(html) || /Changeset:\s*([a-f0-9]{12})/i.exec(html)
      : null;

    if (!versionMatch || !changesetMatch) {
      return null;
    }

    return toEditorVersionInfo({
      version: versionMatch[1],
      changeset: changesetMatch[1],
    });
  };

export const scrapeVersions = async (): Promise<EditorVersionInfo[]> => {
  const unityVersions: UnityChangesetVersion[] = (
    await searchChangesets(SearchMode.Default)
  ).map(({ version, changeset }) => ({
    version,
    changeset,
  }));
  const unityXltsVersions: UnityChangesetVersion[] = (
    await searchChangesets(SearchMode.XLTS)
  ).map(({ version, changeset }) => ({
    version,
    changeset,
  }));
  const latestOfficialVersion = await scrapeLatestOfficialUnityVersion();

  // Merge XLTS versions into main list, avoiding duplicates
  const existingVersions = new Set(unityVersions.map((v) => v.version));
  for (const xltsVersion of unityXltsVersions) {
    if (!existingVersions.has(xltsVersion.version)) {
      unityVersions.push(xltsVersion);
      existingVersions.add(xltsVersion.version);
    }
  }

  if (
    latestOfficialVersion &&
    !existingVersions.has(latestOfficialVersion.version)
  ) {
    unityVersions.push({
      version: latestOfficialVersion.version,
      changeset: latestOfficialVersion.changeSet,
    });
  }

  if (unityVersions?.length > 0) {
    return unityVersions
      .map(toEditorVersionInfo)
      .filter(
        (versionInfo): versionInfo is EditorVersionInfo =>
          versionInfo !== null,
      );
  }

  throw new Error('No Unity versions found!');
};
