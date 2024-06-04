import { Discord } from "../../service/discord";
import { Cleaner } from "./cleaner";

export const cleanUpBuilds = async (discordClient: Discord) => {
  await Cleaner.cleanUp(discordClient);
};
