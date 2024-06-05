import semver from 'semver';
import { RepoVersionInfo } from '../../model/repoVersionInfo';
import { GitHub } from '../../service/github';

export const scrapeVersions = async (
  githubPrivateKey: string,
  githubClientSecret: string,
): Promise<RepoVersionInfo[]> => {
  const gitHub = await GitHub.init(githubPrivateKey, githubClientSecret);

  const releases = await gitHub.repos.listReleases({
    owner: 'unity-ci',
    repo: 'docker',
  });

  const versions = releases.data.map((release) => {
    const {
      id,
      url,
      name,
      body: description,
      tag_name: tagName,
      author: { login: author },
      target_commitish: commitIsh,
    } = release;

    const version = semver.valid(semver.coerce(tagName));
    if (!version) {
      throw new Error("Assumed versions to always be parsable, but they're not.");
    }
    const major = semver.major(version);
    const minor = semver.minor(version);
    const patch = semver.patch(version);

    return {
      version,
      major,
      minor,
      patch,
      id,
      name,
      description,
      author,
      commitIsh,
      url,
    } as RepoVersionInfo;
  });

  return versions;
};
