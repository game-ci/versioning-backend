import { BaseOs } from './image';

export type GitHubEventType =
  | 'new_base_images_requested'
  | 'new_hub_images_requested'
  | 'new_ubuntu_editor_image_requested'
  | 'new_windows_editor_image_requested'
  | 'retry_ubuntu_editor_image_requested'
  | 'retry_windows_editor_image_requested';

export type FriendlyEventTypes =
  | 'newBaseImages'
  | 'newHubImages'
  | 'newUbuntuEditorImages'
  | 'newWindowsEditorImages'
  | 'retryUbuntuImage'
  | 'retryWindowsImage';

export class GitHubWorkflow {
  public static get eventTypes(): Record<FriendlyEventTypes, GitHubEventType> {
    return {
      newBaseImages: 'new_base_images_requested',
      newHubImages: 'new_hub_images_requested',
      newUbuntuEditorImages: 'new_ubuntu_editor_image_requested',
      newWindowsEditorImages: 'new_windows_editor_image_requested',
      retryUbuntuImage: 'retry_ubuntu_editor_image_requested',
      retryWindowsImage: 'retry_windows_editor_image_requested',
    };
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
