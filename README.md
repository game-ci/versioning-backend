# GameCI Versioning Backend

## Unity version ingest

TODO - Describe how it works

## game-ci/docker version ingest

TODO - Describe how it works

## Scheduler

Each CiJob starts its own workflow.

Each Workflow generates multiple CiBuilds: one per baseOs-targetPlatform combination.
The CiJob workflow will report back a CiBuild for each combination.

For example:

```text
...
  ubuntu-<version>-linuxIl2cpp
  ubuntu-<version>-webgl
  windows-<version>-webgl
...
```

An endpoint from this backend will listen to the reports and update the database.
Each CiBuild starts with the status "started" after it is being reported.

When the last CiBuild is set to "published", the CiJob for that version is also set to "completed".
Completed CiJobs are reported to Discord.

## Ingeminator

TODO - Describe how it works

## Database Backup

The firestore database can be backed up with the following command:
`yarn run backfire export ./export/versioningBackendBackup --project unity-ci-versions --keyFile <PATH_TO_GOOGLE_CLOUD_SERVICE_ACCOUNT_KEYFILE.json>`

Similarly, it can be used to restore a backup with:
`yarn run backfire import ./export/versioningBackendBackup --project unity-ci-versions --keyFile <PATH_TO_GOOGLE_CLOUD_SERVICE_ACCOUNT_KEYFILE.json>`

You likely would want to empty the database before restoring but you can also use flags like overwrite, merge, etc to control the restoration
rules.
