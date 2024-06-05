import admin from 'firebase-admin';
import { auth } from '../../service/firebase';

const getUserByEmailAddress = async (emailAddress: string): Promise<admin.auth.UserRecord> => {
  const user = await auth.getUserByEmail(emailAddress);
  if (!user) throw new Error(`No user for ${emailAddress}, skipping.`);

  return user;
};

const makeUserAnAdmin = async (user: admin.auth.UserRecord): Promise<void> => {
  const { customClaims = {}, displayName } = user;
  if (customClaims.admin === true) {
    return;
  }

  const updatedClaims = { ...customClaims, admin: true };
  await auth.setCustomUserClaims(user.uid, updatedClaims);
  console.log(`${displayName} is now an admin. Claims:`, updatedClaims);
};

const makeAdminByEmailAddress = async (emailAddress: string): Promise<void> => {
  try {
    const user = await getUserByEmailAddress(emailAddress);

    await makeUserAnAdmin(user);
  } catch (error: any) {
    console.log(`${emailAddress}: ${error.message}.`);
  }
};

export const assignDefaultAdmins = async (adminEmailAddresses: string[]): Promise<void> => {
  if (!adminEmailAddresses) {
    return;
  }

  for (const emailAddress of adminEmailAddresses) {
    await makeAdminByEmailAddress(emailAddress);
  }
};
