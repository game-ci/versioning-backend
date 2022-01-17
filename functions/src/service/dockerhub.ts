import fetch from 'node-fetch';
import { settings } from '../config/settings';

type ImageType = 'base' | 'hub' | 'editor';

export class Dockerhub {
  private static get host() {
    return settings.dockerhub.host;
  }

  public static getRepositoryBaseName() {
    return settings.dockerhub.repositoryBaseName;
  }

  public static getImageName(imageType: ImageType) {
    const { baseImageName, hubImageName, editorImageName } = settings.dockerhub;
    switch (imageType) {
      case 'base':
        return `${baseImageName}`;
      case 'hub':
        return `${hubImageName}`;
      case 'editor':
        return `${editorImageName}`;
      default:
        throw new Error(`[Dockerhub] There is no repository configured of type ${imageType}.`);
    }
  }

  public static getFullRepositoryName(imageType: ImageType) {
    return `${this.getRepositoryBaseName()}/${this.getImageName(imageType)}`;
  }

  public static async fetchImageData(imageType: ImageType, tag: string) {
    const { host } = this;
    const repository = this.getFullRepositoryName(imageType);
    const response = await fetch(`${host}/repositories/${repository}/tags/${tag}`);

    if (!response.ok) return null;

    return response.json();
  }
}