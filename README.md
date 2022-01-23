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
