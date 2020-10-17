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
    messageContent: Eris.MessageContent,
    files: Eris.MessageFile | Eris.MessageFile[] | undefined = undefined,
  ): Promise<boolean> {
    let success = false;
    try {
      const discord = await this.getInstance();

      if (typeof messageContent === 'string') {
        for (const message of Discord.splitMessage(messageContent)) {
          await discord.createMessage(channelId, message, files);
        }
      } else {
        await discord.createMessage(channelId, messageContent, files);
      }

      success = true;
    } catch (err) {
      firebase.logger.error('An error occurred while trying to send a message to discord.', err);
    } finally {
      await this.disconnect();
    }

    return success;
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
    while (!instance?.startTime) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      secondsWaited += 1;

      if (secondsWaited >= 15) {
        throw new Error('Bot never became ready');
      }
    }
  }

  static async disconnect(): Promise<void> {
    if (!instance) return;

    instance.disconnect({ reconnect: false });
    instance = null;
  }

  static splitMessage(message: string, maxMessageSize: number = 1950): Array<string> {
    const numberOfMessages = Math.ceil(message.length / maxMessageSize);
    const messages: Array<string> = new Array<string>(numberOfMessages);

    for (let i = 0, pointer = 0; i < numberOfMessages; i++) {
      let messageSize = maxMessageSize;

      let prefix = '';
      if (i !== 0) {
        prefix = '...';
        messageSize -= 3;
      }

      let suffix = '';
      if (i !== numberOfMessages - 1) {
        suffix = '...';
        messageSize -= 3;
      }

      messages[i] = `${prefix}${message.substr(pointer, messageSize)}${suffix}`;
      pointer += messageSize;
    }

    return messages;
  }
}
