import { getDocumentFromUrl } from '../utils/get-document-from-url';
import { EditorVersionInfo } from '../../model/editorVersionInfo';
import fetch from 'cross-fetch';

const reMatchUnityModuleNames = new RegExp(`\\[(.*?)\\]`, 'gm');

/**
 * Incompatible versions for different modules for different platforms
 * Format is a map with key module: string and value Array<string>
 * The array should contain filters for incompatible versions
 * You only have to specify incompatibility if the modules are only
 * incompatible with gameCI, modules that inherently aren't compatible
 * with an editor version are automatically filtered.
 *
 * Filter formats
 * - Singular version ie: '2019.3.10f1'
 * Indicates that specific version is not compatible.
 *
 * - Unbounded bottom range ie: '-2019.3.0f1'
 * Indicates all versions below the upper bound, but not including
 * the upper bound are incompatible. In this example, everything
 * below 2019.3.0f1 is considered incompatible but 2019.3.0f1 is
 * considered compatible
 *
 * - Unbounded upper range ie: '2019.3.0f1-'
 * Indicates all versions above the bottom bound, and including the
 * bottom bound are incompatible. In this example all versions above
 * 2019.3.0f1 are considered incompatible and 2019.3.0f1 is also
 * considered incompatible
 *
 * - Fully bounded range ie: '2019.3.0f1-2019.3.3f1'
 * Same rules as the unbounded versions. Anything above or equal to 2019.3.0f1
 * but less than but not equal to 2019.3.3f1 is considered incompatible
 */
const incompatibleLinuxModules = new Map([['android', ['-2019.3.0f1']]]); // We don't support Android images for Linux below 2019.3.0f1
const incompatibleWindowsModules = new Map();
const incompatibleMacModules = new Map();

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

export const getSupportedModulesWindows = async (editorVersion: string, editorChangeset: string): Promise<string> => {
  const windowsModules = await getModules(editorVersion, editorChangeset, 'win');
  const compatibleWindowsModules = filterIncompatibleModules(editorVersion, windowsModules, incompatibleWindowsModules);

  //Add on base to the requested modules and put into a set to ensure no duplicates
  const moduleSet = new Set([...compatibleWindowsModules, 'base']);

  // Convert the set into a comma separated string and return it
  return Array.from(moduleSet).join(',');
}

export const getSupportedModulesLinux = async (editorVersion: string, editorChangeset: string): Promise<string> => {
  const linuxModules = await getModules(editorVersion, editorChangeset, 'linux');
  const compatibleLinuxModules = filterIncompatibleModules(editorVersion, linuxModules, incompatibleLinuxModules);

  //Add on base to the requested modules and put into a set to ensure no duplicates
  const moduleSet = new Set([...compatibleLinuxModules, 'base']);

  // Convert the set into a comma separated string and return it
  return Array.from(moduleSet).join(',');
}

export const getSupportedModulesMac = async (editorVersion: string, editorChangeset: string): Promise<string> => {
  const macModules = await getModules(editorVersion, editorChangeset, 'osx');
  const compatibleMacModules = filterIncompatibleModules(editorVersion, macModules, incompatibleMacModules);

  //Add on base to the requested modules and put into a set to ensure no duplicates
  const moduleSet = new Set([...compatibleMacModules, 'base']);

  // Convert the set into a comma separated string and return it
  return Array.from(moduleSet).join(',');
}

//Fetches all supported modules for a specific verion of unity on a given base platform
async function getModules(version:string, changeset:string, platform:string): Promise<Array<string>> {
  // Get the config file that details all modules available to the version
  const res = await fetch(`${UNITY_DOWNLOAD_API_URL}/${changeset}/unity-${version}-${platform}.ini`);

  if (res.status >= 400) {
      throw new Error("Bad response from server");
  }

  const responseBody = await res.text();
  const moduleSet = new Array<string>();

  // Pull out each module name using regex
  const reMatchedModules = responseBody.matchAll(reMatchUnityModuleNames);

  // Add names to a set that we return
  let module = reMatchedModules.next();
  while(!module.done) {
      moduleSet.push(module.value[1].toLowerCase());
      module = reMatchedModules.next();
  }
  return moduleSet;
}

/**
 * Compares Unity Versions
 * Returns -1 if versionA is less than versionB
 * Returns 1 if versionA is greater than versionB
 * Returns 0 if the versions are identical
 */
function compareVersions(versionA: string, versionB: string) {
  const [majorA, minorA, patchAWithVersionType] = versionA.split('.');
  const [majorB, minorB, patchBWithVersionType] = versionB.split('.');

  //Removing the 'f1' part of the string
  const patchA = patchAWithVersionType.slice(0, patchAWithVersionType.length-2);
  const patchB = patchBWithVersionType.slice(0, patchBWithVersionType.length-2);

  if (majorA > majorB) {
      return 1;
  }
  if (majorA < majorB) {
      return -1;
  }
  if (minorA > minorB) {
      return 1;
  }
  if (minorA < minorB) {
      return -1;
  }
  if (patchA > patchB) {
      return 1;
  }
  if (patchA < patchB) {
      return -1;
  }
  // All fields are identical
  return 0;
}

/**
 * Filters out incompatible modules from a provided array of modules
 * Returns a list of compatible modules
 */
function filterIncompatibleModules(targetVersion: string, targetModules: Array<string>,
                                   incompatibleModules: Map<string, Array<string>>) {
  let filteredModules = new Array<string>();
  for (let i = 0; i < targetModules.length; ++i) {

      // We have versions that aren't compatible with this module
      if (incompatibleModules.has(targetModules[i])) {
          const incompatibleVersions = incompatibleModules.get(targetModules[i]);

          //Extract version filters that match this version
          const filteredVersions = incompatibleVersions?.filter(function (filterVersion: string) {
              const versionRange = filterVersion.split('-');

              //Check for a singular version filter (No range)
              if (versionRange.length === 1)
              {
                  // In singular version filters, an exact match means they are incompatible
                  return compareVersions(targetVersion, filterVersion) === 0;
              }

              const [bottomBound, topBound] = versionRange;

              //Checking a range of versions with no bottom or top bound
              if (bottomBound === '') {
                  //When there is no bottom bound, the filter acts as top bound exclusive
                  //so it is only incompatible if the version is less than the top bound
                  return compareVersions(targetVersion, topBound) < 0;
              }
              if (topBound === '') {
                  //When there is no top bound, the filter acts bottom bound inclusive
                  //so it is incompatible if it is greater than or equal to the bottom bound
                  return compareVersions(targetVersion, bottomBound) > -1;
              }

              //Same filter behavior as above but chained together for a close bound filter
              return compareVersions(targetVersion, bottomBound) > -1 && compareVersions(targetVersion, topBound) < 0;
          });

          //If no filters flagged the target version, the module is compatible
          if (filteredVersions?.length === 0) {
              filteredModules.push(targetModules[i]);
          }
      }
      else {
          //We have no incompatibilites with this module so we can just add it
          filteredModules.push(targetModules[i]);
      }
  }
  return filteredModules;
}
