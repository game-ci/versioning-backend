import * as Eris from 'eris';
import { firebase } from './firebase';

const { token } = firebase.config().discord;
const discord = new Eris.Client(token);

export { discord };
