import * as Eris from 'eris';
import { firebase } from './firebase';
import { settings } from './settings';

const { token } = firebase.config().discord;

let instance: Eris.Client | null = null;
let ready = false;

export class Discord {
  static async sendNews(
    message: Eris.MessageContent,
    files: Eris.MessageFile | Eris.MessageFile[] | undefined = undefined,
  ): Promise<boolean> {
    return this.sendMessage(settings.discord.channels.news, message, files);
  }

  static async sendAlert(
    message: Eris.MessageContent,
    files: Eris.MessageFile | Eris.MessageFile[] | undefined = undefined,
  ): Promise<boolean> {
    return this.sendMessage(settings.discord.channels.alerts, message, files);
  }

  static async sendMessageToMaintainers(
    message: Eris.MessageContent,
    files: Eris.MessageFile | Eris.MessageFile[] | undefined = undefined,
  ): Promise<boolean> {
    return this.sendMessage(settings.discord.channels.maintainers, message, files);
  }

  static async sendMessage(
    channelId: string,
    message: Eris.MessageContent,
    files: Eris.MessageFile | Eris.MessageFile[] | undefined = undefined,
  ): Promise<boolean> {
    try {
      const i = await this.getInstance();

      // Todo - retry mechanism

      await i.createMessage(channelId, message, files);
      return true;
    } catch (err) {
      firebase.logger.error('An error occurred while trying to send a message to discord.', err);
      return false;
    }
  }

  static async getInstance(): Promise<Eris.Client> {
    if (instance) {
      return instance;
    }

    instance = new Eris.Client(token);

    instance.on('messageCreate', async (message) => {
      if (message.content === '!ping') {
        firebase.logger.info('[discord] pong!');
        await message.channel.createMessage('Pong!');
      }
    });

    await instance.connect();
    await this.becomeReady();

    return instance;
  }

  static async becomeReady(): Promise<void> {
    let secondsWaited = 0;
    while (!ready && secondsWaited <= 5) {
      if (instance?.startTime) {
        ready = true;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      secondsWaited += 1;
    }
    throw new Error('Bot never became ready');
  }

  static async disconnect(): Promise<void> {
    if (!instance) return;

    instance.disconnect({ reconnect: false });
    instance = null;
  }
}
