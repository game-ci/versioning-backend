import * as Eris from 'eris';
import { firebase } from './firebase';
import { settings } from '../config/settings';

const { token } = firebase.config().discord;

let instance: Eris.Client | null = null;

export class Discord {
  public static async sendDebugLine(message: 'begin' | 'end') {
    const discord = await this.getInstance();

    await discord.createMessage(settings.discord.channels.debug, `--- ${message} ---`);
  }

  public static async sendDebug(
    message: Eris.MessageContent,
    files: Eris.MessageFile | Eris.MessageFile[] | undefined = undefined,
  ): Promise<boolean> {
    firebase.logger.info(message);

    // Set to null as we don't differ between debug/info yet. Null is debug.
    return this.sendMessage(null, message, files, 'info');
  }

  public static async sendNews(
    message: Eris.MessageContent,
    files: Eris.MessageFile | Eris.MessageFile[] | undefined = undefined,
  ): Promise<boolean> {
    return this.sendMessage(settings.discord.channels.news, message, files, 'info');
  }

  public static async sendAlert(
    message: Eris.MessageContent,
    files: Eris.MessageFile | Eris.MessageFile[] | undefined = undefined,
  ): Promise<boolean> {
    return this.sendMessage(settings.discord.channels.alerts, message, files, 'error');
  }

  public static async sendMessageToMaintainers(
    message: Eris.MessageContent,
    files: Eris.MessageFile | Eris.MessageFile[] | undefined = undefined,
  ): Promise<boolean> {
    return this.sendMessage(settings.discord.channels.maintainers, message, files, 'info');
  }

  private static async sendMessage(
    channelId: string | null,
    messageContent: Eris.MessageContent,
    files: Eris.MessageFile | Eris.MessageFile[] | undefined = undefined,
    level: 'debug' | 'info' | 'warn' | 'error' | 'critical',
  ): Promise<boolean> {
    let isSent = false;
    try {
      const discord = await this.getInstance();

      if (typeof messageContent === 'string') {
        for (const message of Discord.splitMessage(messageContent)) {
          if (channelId) await discord.createMessage(channelId, message, files);

          // Also send to debug channel
          await discord.createMessage(
            settings.discord.channels.debug,
            `[${level}] ${message}`,
            files,
          );
        }
      } else {
        if (channelId) await discord.createMessage(channelId, messageContent, files);

        // Also send to debug channel
        messageContent.content = `[${level}] ${messageContent.content}`;
        await discord.createMessage(settings.discord.channels.debug, messageContent, files);
      }

      isSent = true;
    } catch (err) {
      firebase.logger.error('An error occurred while trying to send a message to discord.', err);
    } finally {
      await this.disconnect();
    }

    return isSent;
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

  // Max message size must account for ellipsis and level parts that are added to the message.
  static splitMessage(message: string, maxMessageSize: number = 1940): Array<string> {
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

      // Break at spaces
      let maxMessage = message.substr(pointer, messageSize);
      const lastSpacePos = maxMessage.lastIndexOf(' ');
      if (lastSpacePos >= maxMessageSize - 250) {
        maxMessage = maxMessage.substr(pointer, lastSpacePos);
        messageSize = lastSpacePos;
      }

      messages[i] = `${prefix}${maxMessage}${suffix}`;
      pointer += messageSize;
    }

    return messages;
  }
}
