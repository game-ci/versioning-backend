import * as admin from "firebase-admin";
import { getCredential } from "../config/credential";
import { setGlobalOptions } from "firebase-functions/v2/options";

const app = admin.initializeApp({
  credential: getCredential(),
  databaseURL: "https://unity-ci-versions.firebaseio.com",
});

const auth = app.auth();
const db = app.firestore();

// Set functions to same region as database and hosting
setGlobalOptions({ region: "europe-west3" });

export { admin, auth, db };
