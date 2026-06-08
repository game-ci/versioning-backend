import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DockerImageReconciler } from '../src/logic/buildQueue/dockerImageReconciler';
import { EditorVersionInfo } from '../src/model/editorVersionInfo';
import { RepoVersionInfo } from '../src/model/repoVersionInfo';

describe('DockerImageReconciler', () => {
  let mockGitHub: any;
  let repoVersionInfo: RepoVersionInfo;

  beforeEach(() => {
    mockGitHub = {
      repos: {
        createDispatchEvent: vi.fn().mockResolvedValue({ status: 200 }),
      },
    };

    repoVersionInfo = {
      major: 3,
      minor: 2,
      patch: 2,
      version: '3.2.2',
    };
  });

  it('should instantiate with correct version strings', () => {
    const reconciler = new DockerImageReconciler(mockGitHub, repoVersionInfo);
    expect(reconciler).toBeDefined();
  });

  it('should handle empty version list', async () => {
    const reconciler = new DockerImageReconciler(mockGitHub, repoVersionInfo);
    await expect(reconciler.reconcileEditorImages([])).resolves.not.toThrow();
  });

  it('should handle API errors gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const reconciler = new DockerImageReconciler(mockGitHub, repoVersionInfo);
    const version: EditorVersionInfo = {
      version: '6000.4.10f1',
      changeSet: 'feeafc12a938',
      major: 6000,
      minor: 4,
      patch: '10',
    };

    await expect(reconciler.reconcileEditorImages([version])).resolves.not.toThrow();
  });
});
