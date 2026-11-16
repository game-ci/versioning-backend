import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-functions/v2', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../src/service/firebase', () => ({
  db: {},
  admin: {
    firestore: {
      FieldValue: {},
      DocumentSnapshot: {},
      Timestamp: { now: () => 'now' },
    },
  },
}));

const { isSupportedEditorVersion } = await import('../src/model/supportedEditorVersions');
const { CiJobs } = await import('../src/model/ciJobs');

const editorVersion = (version: string) => ({
  version,
  changeSet: 'abc123def456',
  major: Number(version.split('.')[0]),
  minor: Number(version.split('.')[1]),
  patch: version.split('.')[2],
});

const repoVersionInfo = { version: '4.0.0', major: 4, minor: 0, patch: 0 } as any;

describe('isSupportedEditorVersion', () => {
  it.each(['2018.4.36f1', '2019.4.41f2', '2020.3.49f1', '2021.3.45f2'])(
    'excludes end-of-life editor %s',
    (version) => {
      expect(isSupportedEditorVersion(editorVersion(version))).toBe(false);
    },
  );

  it.each(['2022.1.0f1', '2022.3.62f3', '2023.2.22f1', '6000.0.85f2', '6000.4.7f1'])(
    'includes supported editor %s',
    (version) => {
      expect(isSupportedEditorVersion(editorVersion(version))).toBe(true);
    },
  );
});

describe('CiJobs.construct', () => {
  it('creates jobs for base and hub images, which have no editor version', () => {
    expect(CiJobs.construct('base', repoVersionInfo).status).toBe('created');
    expect(CiJobs.construct('hub', repoVersionInfo).status).toBe('created');
  });

  it('creates jobs for supported editors', () => {
    const job = CiJobs.construct('editor', repoVersionInfo, editorVersion('2022.3.62f3'));
    expect(job.status).toBe('created');
  });

  it('deprecates jobs for end-of-life editors', () => {
    const job = CiJobs.construct('editor', repoVersionInfo, editorVersion('2021.3.45f2'));
    expect(job.status).toBe('deprecated');
  });
});
