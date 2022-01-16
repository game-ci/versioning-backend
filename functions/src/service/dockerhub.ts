import fetch from 'node-fetch';
import { settings } from '../config/settings';

type ImageType = 'base' | 'hub' | 'editor';

export class Dockerhub {
  private static get host() {
    return settings.dockerhub.host;
  }

  private static getRepositoryName(imageType: ImageType) {
    switch (imageType) {
      case 'base':
        return settings.dockerhub.baseRepository;
      case 'hub':
        return settings.dockerhub.hubRepository;
      case 'editor':
        return settings.dockerhub.editorRepository;
      default:
        throw new Error(`[Dockerhub] There is no repository configured of type ${imageType}.`);
    }
  }

  public static async fetchImageData(imageType: ImageType, tag: string) {
    const { host } = this;
    const repository = this.getRepositoryName(imageType);
    const response = await fetch(`${host}/repositories/${repository}/tags/${tag}`);

    if (!response.ok) return null;

    return response.json();
  }
}
