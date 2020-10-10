import * as Eris from 'eris';
import { firebase } from './firebase';
import { settings } from './settings';

const { token } = firebase.config().discord;

let instance: Eris.Client | null = null;

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

    const discord = new Eris.Client(token);

    discord.on('messageCreate', async (message) => {
      if (message.content === '!ping') {
        firebase.logger.info('[discord] pong!');
        await message.channel.createMessage('Pong!');
      }
    });

    discord.on('ready', async () => {
      firebase.logger.info('[discord] ready');
      await discord.createMessage(settings.discord.channels.maintainers, 'ready');
    });

    await discord.connect();
    firebase.logger.info('[discord] connected');

    instance = discord;
    return instance;
  }

  static async disconnect(): Promise<void> {
    if (!instance) return;

    instance.disconnect({ reconnect: false });
  }
}
