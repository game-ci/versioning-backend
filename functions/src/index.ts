import { settings } from './config/settings';
import { assignDefaultAdmins } from './logic/init/assignDefaultAdmins';

const init = async () => {
  await assignDefaultAdmins(settings.defaultAdmins);
};

init().catch((error) => {
  console.error(error);
  throw new Error('Deployment failed due to errors.');
});

export * as model from './model-triggers';
export * as cron from './cron';
export * from './api';
