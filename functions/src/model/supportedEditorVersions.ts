import type { EditorVersionInfo } from './editorVersionInfo';

/**
 * The oldest Unity Editor major version that GameCI builds images for.
 *
 * Older (end-of-life) editors keep the images that were already published, but no new image
 * versions are built for them: their jobs are created as `deprecated` and the DockerHub
 * reconciler never dispatches builds for them.
 */
export const OLDEST_SUPPORTED_EDITOR_MAJOR = 2022;

export const isSupportedEditorVersion = ({ major }: Pick<EditorVersionInfo, 'major'>): boolean =>
  major >= OLDEST_SUPPORTED_EDITOR_MAJOR;
