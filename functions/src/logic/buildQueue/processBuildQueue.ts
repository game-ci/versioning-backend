/* prettier-ignore */

export const processBuildQueue = async () => {
  /**
   * When a new Unity version gets ingested:
   *   - a CI Job for that version gets created.
   *
   * When a new repository version gets ingested
   *   - a CI Job for a new base image gets created
   *   - a CI Job for a new hub image gets created
   *   - a CI Job for every Unity version gets created
   *   - Any CI Jobs for older repository versions get status "superseded"
   */

  // if: base image is not built for that version yet (or building right now)
    // build base image
    // return

  // if: hub image is not built for that version yet (or building right now)
    // build hub image
    // return

/**
 * checks before building editor images
 */

  // if: any failures in build queue?
    // do nothing

  // if: non-published amount bigger than settings.maxConcurrentBuilds
    // do nothing

/**
 * Select "created" jobs by editorVersion DESC
 */

  // foreach unbuilt editorVersion
    // dispatch build
    // mark as scheduled
};
