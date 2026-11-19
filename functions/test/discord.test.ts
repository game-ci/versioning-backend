import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-functions/v2', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const eris = vi.hoisted(() => ({
  constructed: [] as Array<{ token: string; options: unknown }>,
  connect: vi.fn(),
  createMessage: vi.fn(async () => ({})),
}));

vi.mock('eris', () => ({
  Client: class {
    constructor(token: string, options: unknown) {
      eris.constructed.push({ token, options });
    }
    connect = eris.connect;
    createMessage = eris.createMessage;
  },
}));

const loadDiscord = async () => {
  vi.resetModules();
  const { Discord } = await import('../src/service/discord');
  return Discord;
};

describe('Discord', () => {
  beforeEach(() => {
    eris.constructed.length = 0;
    eris.connect.mockClear();
    eris.createMessage.mockClear();
  });

  it('sends messages over REST without logging in to the gateway', async () => {
    const Discord = await loadDiscord();

    Discord.init('secret-token');
    await Discord.sendAlert('Build failed');

    expect(eris.connect).not.toHaveBeenCalled();
    expect(eris.constructed).toEqual([
      { token: 'Bot secret-token', options: { restMode: true, intents: 0 } },
    ]);
    expect(eris.createMessage).toHaveBeenCalledWith(
      expect.any(String),
      '[error] Build failed',
      undefined,
    );
  });

  it('accepts a token that already carries the Bot prefix', async () => {
    const Discord = await loadDiscord();

    Discord.init('Bot secret-token');

    expect(eris.constructed[0]?.token).toBe('Bot secret-token');
  });

  it('reuses one client across invocations of a warm instance', async () => {
    const Discord = await loadDiscord();

    Discord.init('secret-token');
    Discord.init('secret-token');

    expect(eris.constructed).toHaveLength(1);
  });

  it('reports a failed send instead of throwing', async () => {
    const Discord = await loadDiscord();
    eris.createMessage.mockRejectedValueOnce(new Error('Missing Access'));

    Discord.init('secret-token');

    await expect(Discord.sendNews('New image')).resolves.toBe(false);
  });
});
