import { UnityVersionInfo } from '../../model/unityVersionInfo';

export const determineNewVersions = async (
  scrapedInfoList: UnityVersionInfo[],
): Promise<UnityVersionInfo[]> => {
  const currentInfoList = await UnityVersionInfo.getAll();
  const currentVersions = currentInfoList.map((currentInfo) => currentInfo.version);

  const newInfoList: UnityVersionInfo[] = [];
  scrapedInfoList.forEach((scrapedInfo) => {
    if (!currentVersions.includes(scrapedInfo.version)) {
      newInfoList.push(scrapedInfo);
    }
  });

  return newInfoList;
};
