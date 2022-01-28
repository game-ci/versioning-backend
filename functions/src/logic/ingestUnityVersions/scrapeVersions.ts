import { getDocumentFromUrl } from '../utils/get-document-from-url';
import { EditorVersionInfo } from '../../model/editorVersionInfo';
import fetch from 'cross-fetch';

const reMatchUnityModuleNames = new RegExp(`\\[(.*?)\\]`, 'gm');

const UNITY_ARCHIVE_URL = 'https://unity3d.com/get-unity/download/archive';
const UNITY_DOWNLOAD_API_URL = 'https://download.unity3d.com/download_unity/';

/**
 * Based on https://github.com/BLaZeKiLL/unity-scraper
 */
export const scrapeVersions = async (): Promise<EditorVersionInfo[]> => {
  const document = await getDocumentFromUrl(UNITY_ARCHIVE_URL);

  const links = Array.from(document.querySelectorAll('a.unityhub[href]'));
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

export const getSupportedModules = async (editorVersion: string, editorChangeset: string, ): Promise<string> => {
  // Fetch module sets for each platform
  const windowsModuleSet = await getModuleSet(editorVersion, editorChangeset, 'win');
  const linuxModuleSet = await getModuleSet(editorVersion, editorChangeset, 'win');
  const macModuleSet = await getModuleSet(editorVersion, editorChangeset, 'osx');

  // Merge all modules into one set
  const mergedModuleSet = new Set([...windowsModuleSet, ...linuxModuleSet, ...macModuleSet]);

  // Convert the set into a comma separated string and return it
  return Array.from(mergedModuleSet).join(',');
}

//Fetches all supported modules for a specific verion of unity on a given base platform
async function getModuleSet(version:string, changeset:string, platform:string): Promise<Set<string>> {
  // Get the config file that details all modules available to the version
  const res = await fetch(`${UNITY_DOWNLOAD_API_URL}/${changeset}/unity-${version}-${platform}.ini`);

  if (res.status >= 400) {
      throw new Error("Bad response from server");
  }

  const responseBody = await res.text();
  const moduleSet = new Set<string>();

  // Pull out each module name using regex
  const reMatchedModules = responseBody.matchAll(reMatchUnityModuleNames);

  // Add names to a set that we return
  let module = reMatchedModules.next();
  while(!module.done) {
      moduleSet.add(module.value[1].toLowerCase());
      module = reMatchedModules.next();
  }
  return moduleSet;
}
