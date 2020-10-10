import * as Eris from 'eris';
import { firebase } from './firebase';
import { settings } from './settings';

const { token } = firebase.config().discord;

let instance: Eris.Client;

export class Discord {
  static async sendNews(
    message: Eris.MessageContent,
    files: Eris.MessageFile | Eris.MessageFile[] | undefined = undefined,
  ) {
    const i = await this.getInstance();

    await i.createMessage(settings.discord.channels.news, message, files);
  }

  static async sendAlert(
    message: Eris.MessageContent,
    files: Eris.MessageFile | Eris.MessageFile[] | undefined = undefined,
  ) {
    const i = await this.getInstance();

    await i.createMessage(settings.discord.channels.alerts, message, files);
  }

  static async sendMessageToMaintainers(
    message: Eris.MessageContent,
    files: Eris.MessageFile | Eris.MessageFile[] | undefined = undefined,
  ) {
    const i = await this.getInstance();

    await i.createMessage(settings.discord.channels.maintainers, message, files);
  }

  static async getInstance() {
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
}
