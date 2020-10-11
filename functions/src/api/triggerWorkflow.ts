import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { firebase, functions } from '../config/firebase';
import { GitHub } from '../config/github';

export const triggerWorkflow = functions.https.onRequest(
  async (request: Request, response: Response) => {
    try {
      const gitHub = await GitHub.init();

      // This works only in the "installation" auth scope.
      const result = await gitHub.repos.createDispatchEvent({
        owner: 'unity-ci',
        repo: 'docker',
        event_type: 'new_build_requested',
        client_payload: {
          test_var: 'test value',
        },
      });

      response.status(200).send(result);
    } catch (err) {
      firebase.logger.error(err);
      response.status(500).send('Oops.');
    }
  },
);
