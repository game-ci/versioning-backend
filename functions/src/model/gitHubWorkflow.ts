import { BaseOs } from './image';
import { EditorVersionInfo } from './editorVersionInfo';

export type GitHubEventType =
  | 'new_base_images_requested'
  | 'new_hub_images_requested'
  | 'new_legacy_editor_image_requested'
  | 'new_post_2019_2_editor_image_requested'
  | 'retry_ubuntu_editor_image_requested'
  | 'retry_windows_editor_image_requested';

export type FriendlyEventTypes =
  | 'newBaseImages'
  | 'newHubImages'
  | 'newLegacyImage'
  | 'newPost2019dot2Image'
  | 'retryUbuntuImage'
  | 'retryWindowsImage';

export class GitHubWorkflow {
  public static get eventTypes(): Record<FriendlyEventTypes, GitHubEventType> {
    return {
      newBaseImages: 'new_base_images_requested',
      newHubImages: 'new_hub_images_requested',
      newLegacyImage: 'new_legacy_editor_image_requested',
      newPost2019dot2Image: 'new_post_2019_2_editor_image_requested',
      retryUbuntuImage: 'retry_ubuntu_editor_image_requested',
      retryWindowsImage: 'retry_windows_editor_image_requested',
    };
  }

  /**
   * Note: CiJob includes all builds for all base OSes
   */
  public static getEventTypeForEditorCiJob(editorVersionInfo: EditorVersionInfo): GitHubEventType {
    const { major, minor } = editorVersionInfo;

    if (major >= 2020 || (major === 2019 && minor >= 3)) {
      return GitHubWorkflow.eventTypes.newPost2019dot2Image;
    } else {
      return GitHubWorkflow.eventTypes.newLegacyImage;
    }
  }

  /**
   * Note: CiBuild includes only a single baseOs-editorVersion-targetPlatform combination.
   */
  public static getEventTypeForRetryingEditorCiBuild(baseOs: BaseOs): GitHubEventType {
    switch (baseOs) {
      case 'ubuntu':
        return GitHubWorkflow.eventTypes.retryUbuntuImage;
      case 'windows':
        return GitHubWorkflow.eventTypes.retryWindowsImage;
      default:
        throw new Error(`No retry method for base OS "${baseOs}" implemented.`);
    }
  }
}
