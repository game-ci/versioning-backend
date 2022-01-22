export type ImageType = 'base' | 'hub' | 'editor';
export type BaseOs = 'windows' | 'ubuntu';
export type TargetPlatform =
  | 'webgl'
  | 'mac-mono'
  | 'windows-mono'
  | 'windows-il2cpp'
  | 'universal-windows-platform'
  | 'base'
  | 'linux-il2cpp'
  | 'android'
  | 'ios'
  | 'appletv'
  | 'facebook';

export class Image {
  public static get types(): Record<ImageType, ImageType> {
    return {
      base: 'base',
      hub: 'hub',
      editor: 'editor',
    };
  }

  public static get baseOses(): Record<BaseOs, BaseOs> {
    return {
      ubuntu: 'ubuntu',
      windows: 'windows',
    };
  }

  public static get targetPlatformSuffixes(): Record<string, TargetPlatform> {
    return {
      webgl: 'webgl',
      mac: 'mac-mono',
      windows: 'windows-mono',
      windowsIl2cpp: 'windows-il2cpp',
      wsaPlayer: 'universal-windows-platform',
      linux: 'base',
      linuxIl2cpp: 'linux-il2cpp',
      android: 'android',
      ios: 'ios',
      tvos: 'appletv',
      facebook: 'facebook',
    };
  }
}
