import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { firebase, functions } from '../config/firebase';
import { GitHub } from '../config/github';

export const triggerWorkflow = functions.https.onRequest(
  async (request: Request, response: Response) => {
    try {
      // @ts-ignore
      const gitHub = await GitHub.init();

      // This works only in the "installation" auth scope.

      // // Base - SUCCESS
      // const result = await gitHub.repos.createDispatchEvent({
      //   owner: 'unity-ci',
      //   repo: 'docker',
      //   event_type: 'new_base_image_requested',
      //   client_payload: {
      //     jobId: 'someJobId',
      //     buildId: 'someBuildId',
      //     patchTag: '0.2.0',
      //     minorTag: '0.2',
      //     majorTag: '0',
      //   },
      // });

      // // Hub - SUCCESS
      // const result = await gitHub.repos.createDispatchEvent({
      //   owner: 'unity-ci',
      //   repo: 'docker',
      //   event_type: 'new_hub_image_requested',
      //   client_payload: {
      //     jobId: 'someJobId',
      //     buildId: 'someBuildId',
      //     patchTag: '0.2.0',
      //     minorTag: '0.2',
      //     majorTag: '0',
      //   },
      // });

      // // Editor - SUCCESS
      // const result = await gitHub.repos.createDispatchEvent({
      //   owner: 'unity-ci',
      //   repo: 'docker',
      //   event_type: 'new_editor_image_requested',
      //   client_payload: {
      //     jobId: 'someJobId',
      //     buildId: 'someBuildId',
      //     unityVersion: '2019.3.11f1',
      //     changeSet: 'ceef2d848e70',
      //     patchTag: '0.2.0',
      //     minorTag: '0.2',
      //     majorTag: '0',
      //   },
      // });

      response.status(200).send(':)');
    } catch (err) {
      firebase.logger.error(err);
      response.status(500).send('Oops.');
    }
  },
);
