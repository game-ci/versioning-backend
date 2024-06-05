import { Client as ErisClient, FileContent, Message, MessageContent } from 'eris';
import { logger } from 'firebase-functions/v2';
import { settings } from '../config/settings';

export class Discord {
  instance: ErisClient | null = null;

  public async init(token: string) {
    this.instance = new ErisClient(token);
    this.instance.on('messageCreate', async (message: Message) => {
      if (message.content === '!ping') {
        logger.info('[discord] pong!');
        await message.channel.createMessage('Pong!');
      }
    });

    await this.instance.connect();

    let secondsWaited = 0;
    while (!this.instance?.startTime) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      secondsWaited += 1;

      if (secondsWaited >= 15) {
        throw new Error('Bot never became ready');
      }
    }
  }

  public async sendDebugLine(message: 'begin' | 'end') {
    await this.instance?.createMessage(settings.discord.channels.debug, `--- ${message} ---`);
  }

  public async sendDebug(
    message: MessageContent,
    files: FileContent | FileContent[] | undefined = undefined,
  ): Promise<boolean> {
    logger.info(message);

    // Set to null as we don't differ between debug/info yet. Null is debug.
    return this.sendMessage(null, message, 'info', files);
  }

  public async sendNews(
    message: MessageContent,
    files: FileContent | FileContent[] | undefined = undefined,
  ): Promise<boolean> {
    return this.sendMessage(settings.discord.channels.news, message, 'info', files);
  }

  public async sendAlert(
    message: MessageContent,
    files: FileContent | FileContent[] | undefined = undefined,
  ): Promise<boolean> {
    return this.sendMessage(settings.discord.channels.alerts, message, 'error', files);
  }

  public async sendMessageToMaintainers(
    message: MessageContent,
    files: FileContent | FileContent[] | undefined = undefined,
  ): Promise<boolean> {
    return this.sendMessage(settings.discord.channels.maintainers, message, 'info', files);
  }

  private async sendMessage(
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
            await this.instance?.createMessage(channelId, message, files);
          }

          // Also send to debug channel
          await this.instance?.createMessage(
            settings.discord.channels.debug,
            `[${level}] ${message}`,
            files,
          );
        }
      } else {
        if (channelId) {
          await this.instance?.createMessage(channelId, messageContent, files);
        }

        // Also send to debug channel
        messageContent.content = `[${level}] ${messageContent.content}`;
        await this.instance?.createMessage(settings.discord.channels.debug, messageContent, files);
      }

      isSent = true;
    } catch (err) {
      logger.error('An error occurred while trying to send a message to discord.', err);
    }

    return isSent;
  }

  public async disconnect(): Promise<void> {
    if (!this.instance) return;

    this.instance.disconnect({ reconnect: false });
    this.instance = null;
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
