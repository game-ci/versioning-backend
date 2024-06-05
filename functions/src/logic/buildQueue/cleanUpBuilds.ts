import { Cleaner } from "./cleaner";

export const cleanUpBuilds = async () => {
  await Cleaner.cleanUp();
};
