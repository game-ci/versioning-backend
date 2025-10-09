import { Client as ErisClient, FileContent, Message, MessageContent } from 'eris';
import { logger } from 'firebase-functions/v2';
import { settings } from '../config/settings';

let instance: ErisClient | null = null;
let instanceCount = 0;
export class Discord {
  public static async init(token: string) {
    if (instance) {
      instanceCount += 1;
      return;
    }

    instance = new ErisClient(token);
    instance.on('messageCreate', async (message: Message) => {
      if (message.content === '!ping') {
        logger.info('[discord] pong!');
        await message.channel.createMessage('Pong!');
      }
    });

    await instance.connect();

    let secondsWaited = 0;
    while (!instance?.startTime) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      secondsWaited += 1;

      if (secondsWaited >= 15) {
        throw new Error('Bot never became ready');
      }
    }

    instanceCount += 1;
  }

  public static async sendDebugLine(message: 'begin' | 'end') {
    await instance?.createMessage(settings.discord.channels.debug, `--- ${message} ---`);
  }

  public static async sendDebug(
    message: MessageContent,
    files: FileContent | FileContent[] | undefined = undefined,
  ): Promise<boolean> {
    logger.info(message);

    // Set to null as we don't differ between debug/info yet. Null is debug.
    return this.sendMessage(null, message, 'info', files);
  }

  public static async sendNews(
    message: MessageContent,
    files: FileContent | FileContent[] | undefined = undefined,
  ): Promise<boolean> {
    return this.sendMessage(settings.discord.channels.news, message, 'info', files);
  }

  public static async sendAlert(
    message: MessageContent,
    files: FileContent | FileContent[] | undefined = undefined,
  ): Promise<boolean> {
    return this.sendMessage(settings.discord.channels.alerts, message, 'error', files);
  }

  public static async sendMessageToMaintainers(
    message: MessageContent,
    files: FileContent | FileContent[] | undefined = undefined,
  ): Promise<boolean> {
    return this.sendMessage(settings.discord.channels.maintainers, message, 'info', files);
  }

  private static async sendMessage(
    channelId: string | null,
    messageContent: MessageContent,
    level: 'debug' | 'info' | 'warn' | 'error' | 'critical',
    files: FileContent | FileContent[] | undefined = undefined,
  ): Promise<boolean> {
    let isSent = false;
    try {
      if (typeof messageContent === 'string') {
        for (const message of Discord.splitMessage(messageContent)) {
          if (channelId) {
            await instance?.createMessage(channelId, message, files);
          }

          // Also send to debug channel
          await instance?.createMessage(
            settings.discord.channels.debug,
            `[${level}] ${message}`,
            files,
          );
        }
      } else {
        if (channelId) {
          await instance?.createMessage(channelId, messageContent, files);
        }

        // Also send to debug channel
        messageContent.content = `[${level}] ${messageContent.content}`;
        await instance?.createMessage(settings.discord.channels.debug, messageContent, files);
      }

      isSent = true;
    } catch (err) {
      logger.error('An error occurred while trying to send a message to discord.', err);
    }

    return isSent;
  }

  public static disconnect() {
    if (!instance) return;
    instanceCount -= 1;

    if (instanceCount > 0) return;

    instance.disconnect({ reconnect: false });
    instance = null;

    if (instanceCount < 0) {
      logger.error('Discord instance count is negative! This should not happen');
      instanceCount = 0;
    }
  }

  // Max message size must account for ellipsis and level parts that are added to the message.
  static splitMessage(message: string, maxMessageSize: number = 1940): Array<string> {
    const numberOfMessages = Math.ceil(message.length / maxMessageSize);
    const messages: Array<string> = Array.from({ length: numberOfMessages });

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
      let maxMessage = message.slice(pointer, pointer + messageSize);
      const lastSpacePos = maxMessage.lastIndexOf(' ');
      if (lastSpacePos >= maxMessageSize - 250) {
        maxMessage = maxMessage.slice(pointer, pointer + lastSpacePos);
        messageSize = lastSpacePos;
      }

      messages[i] = `${prefix}${maxMessage}${suffix}`;
      pointer += messageSize;
    }

    return messages;
  }
}
