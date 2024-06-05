export const settings = {
  defaultAdmins: [
    'webber.nl@gmail.com',
    'lebreton.gabriel@gmail.com',
    'davidmfinol@gmail.com',
    'andrewk010110@gmail.com',
  ],
  minutesBetweenScans: 15,
  maxConcurrentJobs: 9,
  maxExtraJobsForRescheduling: 1,
  maxToleratedFailures: 2,
  maxFailuresPerBuild: 15,
  discord: {
    channels: {
      news: '731947345478156391', // #news (public)
      maintainers: '764289922663841792', // # build-notifications (internal)
      alerts: '763544776649605151', // #alerts (internal)
      debug: '815382556143910953', // #backend (internal)
    },
  },
  github: {
    auth: {
      id: 84327,
      installationId: 12321333,
      clientId: 'Iv1.fa93dce6a47c9357',
    },
  },
  dockerhub: {
    host: 'https://index.docker.io/v1',
    repositoryBaseName: 'unityci',
    baseImageName: 'base',
    hubImageName: 'hub',
    editorImageName: 'editor',
  },
};
