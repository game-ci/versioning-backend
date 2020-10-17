/* prettier-ignore */
export const updateBuildQueue = async () => {
  // When unity versions get ingested,
    // jobs are created
  // When repo versions get ingested,
    // all "created" jobs get "superseded"
    // base image job gets created
    // hub image job gets created
    // editor image jobs are created for all existing editor versions

  /**
   * Select latest repoVersion
   */

  // if: any images from previous repoVersions
    // mark them as superseeded

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
