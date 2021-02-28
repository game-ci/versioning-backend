import { functions, admin } from '../config/firebase';
import { Request } from 'firebase-functions/lib/providers/https';
import { Response } from 'express-serve-static-core';
import { CiBuilds } from '../model/ciBuilds';
import { CiJobs } from '../model/ciJobs';
import { Ingeminator } from '../logic/buildQueue/ingeminator';
import { GitHub } from '../config/github';
import { RepoVersionInfo } from '../model/repoVersionInfo';

export const retryBuild = functions.https.onRequest(
  async (request: Request, response: Response) => {
    try {
      response.set('Content-Type', 'application/json');

      // Allow pre-flight from cross origin
      response.set('Access-Control-Allow-Origin', '*');
      response.set('Access-Control-Allow-Methods', ['POST']);
      response.set('Access-Control-Allow-Headers', ['Content-Type', 'Authorization']);
      if (request.method === 'OPTIONS') {
        response.status(204).send({ message: 'OK' });
        return;
      }

      // User must be authenticated
      const token = request.header('Authorization')?.replace(/^Bearer\s/, '');
      console.log('token:', token);
      if (!token) {
        response.status(401).send({ message: 'Unauthorized' });
        return;
      }

      // User must be an admin
      const user = await admin.auth().verifyIdToken(token);
      if (!user || !user.email_verified || !user.admin) {
        response.status(401).send({ message: 'Unauthorized' });
        return;
      }

      // Validate arguments
      const { buildId, relatedJobId: jobId } = request.body;
      if (!buildId || !jobId) {
        response.status(400);
        response.send({
          message: 'Bad request',
          description: 'Expected buildId and relatedJobId.',
        });
        return;
      }

      // Only retry existing builds
      const [job, build] = await Promise.all([CiJobs.get(jobId), CiBuilds.get(buildId)]);
      if (!job || !build) {
        response.status(400);
        response.send({
          message: 'Bad request',
          description: 'Expected valid buildId and relatedJobId.',
        });
        return;
      }

      // Check if build is not already running
      if (build.status === 'started') {
        response.status(409);
        response.send({
          message: 'Build was already re-scheduled',
          description: request.body.buildId,
        });
        return;
      }

      // Schedule new build
      const gitHubClient = await GitHub.init();
      const repoVersionInfo = await RepoVersionInfo.getLatest();
      const scheduler = new Ingeminator(1, gitHubClient, repoVersionInfo);
      const scheduledSuccessfully = await scheduler.rescheduleBuild(jobId, job, buildId, build);

      // Report result
      if (scheduledSuccessfully) {
        response.status(200);
        response.send({ message: 'Build has been rescheduled', description: request.body.buildId });
      } else {
        response.status(408);
        response.send({
          message: 'Request to Dockerhub timed out',
          description: request.body.buildId,
        });
      }
    } catch (error) {
      console.log('error', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      response.status(401).send({ message: 'Unauthorized' });
    }
  },
);
