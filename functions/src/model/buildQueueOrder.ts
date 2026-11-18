import type { CiJobQueueItem } from './ciJobs';

// Unity patches look like "85f2": a number, a release stage and a build number.
const PATCH_PATTERN = /^(\d+)([a-z]*)(\d*)$/;

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

const editorVersionOf = (item: CiJobQueueItem): string => item.data.editorVersionInfo!.version;
const minorLineOf = (item: CiJobQueueItem): string => {
  const { major, minor } = item.data.editorVersionInfo!;
  return `${major}.${minor}`;
};

/**
 * Orders queued editor jobs so that every Unity minor version (2022.3, 6000.0, ...) gets its
 * latest patch built first, newest minor first. The remaining patches follow, newest first.
 * This way developers on any supported version get an up-to-date image early in a rollout.
 */
export const orderBuildQueue = (items: CiJobQueueItem[]): CiJobQueueItem[] => {
  const newestFirst = items
    .filter((item) => item.data.editorVersionInfo !== null)
    .toSorted((a, b) => compareEditorVersions(editorVersionOf(b), editorVersionOf(a)));

  const seenMinorLines = new Set<string>();
  const latestOfEachMinor: CiJobQueueItem[] = [];
  const remaining: CiJobQueueItem[] = [];
  for (const item of newestFirst) {
    const minorLine = minorLineOf(item);
    if (seenMinorLines.has(minorLine)) {
      remaining.push(item);
    } else {
      seenMinorLines.add(minorLine);
      latestOfEachMinor.push(item);
    }
  }

  return [...latestOfEachMinor, ...remaining];
};
