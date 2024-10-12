# GameCI Versioning Backend

The GameCI Versioning Backend automates the tracking, scheduling, and reporting of Unity version builds and Docker image workflows. It integrates with GitHub and Discord to streamline CI/CD processes and notifications.

## Overview

This backend handles the ingestion of both Unity versions and GameCI Docker versions. It uses Firebase for scheduling workflows, managing job queues, and storing data.

---

## Unity Version Ingest

[See `scrapeVersions.ts`](functions/src/logic/ingestUnityVersions/scrapeVersions.ts)

The backend regularly scrapes [Unity's version archive page](https://unity.com/releases/editor/archive) to detect new releases or updates to Unity editor versions. When new versions are found:
1. They are added to the Firestore database.
2. Notifications are sent to Discord channels to keep maintainers informed.
3. New CI build jobs are scheduled as necessary.

---

## GameCI/Docker Version Ingest

This backend monitors and ingests new versions for the GameCI Docker images. These versions are tracked in conjunction with Unity versions, ensuring Docker images are built and maintained for each compatible Unity version.

---

## Scheduler

The scheduler coordinates the creation and tracking of CI jobs and builds:
- **CiJob Workflow**: Each `CiJob` corresponds to a workflow for building Docker images for Unity versions. This workflow schedules multiple `CiBuilds`.
- **CiBuild Creation**: A `CiJob` generates multiple `CiBuilds`, with each build representing a unique combination of `baseOs` and `targetPlatform`.
  - Examples:
    ```
    ubuntu-<version>-linuxIl2cpp
    ubuntu-<version>-webgl
    windows-<version>-webgl
    ```
- **Status Tracking**: Once a `CiBuild` is created, it starts with the status `started`. The backend listens for updates on these builds:
  - When a build completes successfully, its status is updated to `published`.
  - Once all `CiBuilds` for a `CiJob` are published, the `CiJob` is marked as `completed`.
- **Notifications**: The status of `CiJobs` and `CiBuilds` is reported to Discord for visibility and tracking.

---

## Ingeminator

_The "Ingeminator" is responsible for rescheduling builds that fail or require retries._

The backend includes logic to detect and retry failed builds. This ensures that all Unity and Docker versions are correctly built, and no job is left incomplete. Details about how the "Ingeminator" works are to be documented.

---

## Database Backup

To back up the Firestore database, use the following command:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="./path/to/serviceAccountKey.json"
yarn run backfire export ./export/versioningBackendBackup --project unity-ci-versions --keyFile $GOOGLE_APPLICATION_CREDENTIALS
```

To restore a backup:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="./path/to/serviceAccountKey.json"
yarn run backfire import ./export/versioningBackendBackup --project unity-ci-versions --keyFile $GOOGLE_APPLICATION_CREDENTIALS
```

_It's recommended to empty the database before restoring to avoid data conflicts, or use flags such as `overwrite` and `merge` to control restoration rules._

More information about the `backfire` tool can be found in the [official documentation](https://github.com/benyap/firestore-backfire).

---

## Development

For instructions on setting up the development environment, running the project locally, and deploying changes, see [DEVELOPMENT.md](./DEVELOPMENT.md).

---

## Contributing

We welcome contributions to improve this project! If you'd like to contribute, please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to get started.
