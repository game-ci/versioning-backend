import type { CiJobQueueItem } from './ciJobs';

// Unity patches look like "85f2" (or "85f-1"): a number, a release stage and a build number.
const PATCH_PATTERN = /^(\d+)([a-z]*)(-?\d*)$/;

const parsePatch = (patch: string): [number, string, number] => {
  const match = PATCH_PATTERN.exec(patch);
  if (!match) return [0, patch, 0];

  const [, number, stage, build] = match;
  return [Number(number), stage, Number(build || 0)];
};

/**
 * Compares Unity editor versions such as "6000.0.85f2" in release order.
 * Patches compare by number, so "85f2" comes after "9f1".
 */
export const compareEditorVersions = (a: string, b: string): number => {
  const [majorA, minorA, patchA = ''] = a.split('.');
  const [majorB, minorB, patchB = ''] = b.split('.');

  const byMajor = Number(majorA) - Number(majorB);
  if (byMajor !== 0) return byMajor;

  const byMinor = Number(minorA) - Number(minorB);
  if (byMinor !== 0) return byMinor;

  const [numberA, stageA, buildA] = parsePatch(patchA);
  const [numberB, stageB, buildB] = parsePatch(patchB);
  if (numberA !== numberB) return numberA - numberB;
  if (stageA !== stageB) return stageA < stageB ? -1 : 1;

  return buildA - buildB;
};

const minorLineOf = (version: string): string => version.split('.').slice(0, 2).join('.');

/**
 * The newest known patch of every Unity minor version (2022.3, 6000.0, ...).
 * Pass every known editor version, not only queued ones: once a minor version's newest patch
 * has been dispatched, that minor version must not get a second build ahead of the others.
 */
export const latestVersionOfEachMinor = (versions: string[]): Set<string> => {
  const latestByMinor = new Map<string, string>();
  for (const version of versions) {
    const minorLine = minorLineOf(version);
    const current = latestByMinor.get(minorLine);
    if (!current || compareEditorVersions(version, current) > 0) {
      latestByMinor.set(minorLine, version);
    }
  }

  return new Set(latestByMinor.values());
};

const editorVersionOf = (item: CiJobQueueItem): string => item.data.editorVersionInfo!.version;
const isDryRun = (item: CiJobQueueItem) => item.id.startsWith('dryRun');
const rolloutJobsFirst = (a: CiJobQueueItem, b: CiJobQueueItem) =>
  Number(isDryRun(a)) - Number(isDryRun(b));

/**
 * Orders queued editor jobs so that every Unity minor version gets its latest patch built first,
 * newest minor first. The remaining patches follow, newest first. This way developers on any
 * supported version get an up-to-date image early in a rollout.
 */
export const orderBuildQueue = (
  items: CiJobQueueItem[],
  latestVersions: Set<string>,
): CiJobQueueItem[] => {
  const newestFirst = items
    .filter((item) => item.data.editorVersionInfo !== null)
    .toSorted((a, b) => compareEditorVersions(editorVersionOf(b), editorVersionOf(a)));

  // One job per minor version goes first. When jobs share a version (a dry run beside the rollout
  // job), the rollout job wins and the rest waits with the remaining patches.
  const promotedMinorLines = new Set<string>();
  const first: CiJobQueueItem[] = [];
  const remaining: CiJobQueueItem[] = [];
  for (const item of newestFirst.toSorted(rolloutJobsFirst)) {
    const version = editorVersionOf(item);
    const minorLine = minorLineOf(version);
    if (latestVersions.has(version) && !promotedMinorLines.has(minorLine)) {
      promotedMinorLines.add(minorLine);
      first.push(item);
    } else {
      remaining.push(item);
    }
  }

  const byVersionNewestFirst = (a: CiJobQueueItem, b: CiJobQueueItem) =>
    compareEditorVersions(editorVersionOf(b), editorVersionOf(a));

  return [...first.toSorted(byVersionNewestFirst), ...remaining.toSorted(byVersionNewestFirst)];
};
