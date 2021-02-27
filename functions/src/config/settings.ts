export const settings = {
  defaultAdmins: ['webber.nl@gmail.com', 'lebreton.gabriel@gmail.com', 'davidmfinol@gmail.com'],
  minutesBetweenScans: 15,
  maxConcurrentJobs: 9,
  maxExtraJobsForRescheduling: 1,
  maxToleratedFailures: 2,
  maxFailuresPerBuild: 15,
  discord: {
    channels: {
      news: '731947345478156391',
      maintainers: '764289922663841792',
      alerts: '763544776649605151',
    },
  },
  github: {
    auth: {
      id: 84327,
      privateKey: '-----BEGIN PRIVATE KEY-----\n... (do not place the actual private key here)',
      installationId: 12321333,
      clientId: 'Iv1.fa93dce6a47c9357',
      clientSecret: '(do not place the real secret here)',
    },
  },
};
