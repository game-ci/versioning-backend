import * as Eris from 'eris';
import { firebase } from './firebase';

const { token } = firebase.config().discord;
const discord = new Eris.Client(token);

discord.on('messageCreate', async (message) => {
  if (message.content === '!ping') {
    await message.channel.createMessage('Pong!');
  }
});

const connection = Promise.resolve(discord.connect());
firebase.logger.warn('discord connection', connection);

const msg = Promise.resolve(discord.createMessage('764289922663841792', 'discord connected'));
firebase.logger.warn('discord message', msg);

export { discord };
