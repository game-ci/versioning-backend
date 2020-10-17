import { EditorVersionInfo } from '../../model/editorVersionInfo';
import { db } from '../../config/firebase';

export const generateBuildQueueFromNewVersionInfoList = async (
  versionInfoList: EditorVersionInfo[],
) => {
  const batch = db.batch();

  // Todo - import build queue here

  await batch.commit();
};
