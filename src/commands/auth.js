import { createInterface } from 'node:readline';
import { request } from '../client.js';
import { read, saveProfile, removeProfile, configPath, DEFAULT_URL } from '../config.js';
import { bold, dim, green, json, table } from '../output.js';

/** Reads a line without echoing it, so the token never appears on screen. */
function prompt(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const wasRaw = input.isRaw;

    process.stdout.write(question);

    if (!input.isTTY) {
      // Piped input, nothing to hide.
      const rl = createInterface({ input, terminal: false });
      rl.once('line', (line) => {
        rl.close();
        resolve(line.trim());
      });
      return;
    }

    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');

    let value = '';

    const done = (result, error) => {
      input.setRawMode(wasRaw ?? false);
      input.pause();
      input.removeListener('data', onData);
      process.stdout.write('\n');
      error ? reject(error) : resolve(result);
    };

    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return done(value.trim());
        if (char === '\u0003') return done(null, new Error('Cancelled.'));
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (char >= ' ') value += char;
      }
    };

    input.on('data', onData);
  });
}

export async function login(args) {
  const name = args.values.profile || 'default';
  const url = process.env.SONA_API_URL || DEFAULT_URL;

  process.stdout.write(
    `Create a token under API in your sona.to dashboard, then paste it here.\n` +
      dim('It will not be shown as you type.\n\n')
  );

  const token = await prompt('Token: ');

  if (!token) {
    throw new Error('No token entered.');
  }

  // Verify before saving, so a typo is caught now rather than on the next
  // command.
  const { data } = await request({ token, url }, 'GET', '/me');

  saveProfile(name, token, url);

  process.stdout.write(
    `\n${green('Logged in')} as ${bold(data.user.email)} on team ${bold(data.team.name)}.\n` +
      dim(`Saved to ${configPath()} as profile "${name}".\n`)
  );

  if (!data.scopes.write) {
    process.stdout.write(
      dim('\nThis token is read only. Create one with write access if you want to publish.\n')
    );
  }
}

export async function logout(args) {
  const name = args.values.profile || 'default';

  if (removeProfile(name)) {
    process.stdout.write(`Removed profile "${name}".\n`);
  } else {
    process.stdout.write(`No profile named "${name}".\n`);
  }
}

export async function list(args) {
  const config = read();
  const profiles = Object.entries(config.profiles || {});

  if (args.values.json) {
    return json(
      profiles.map(([name, p]) => ({
        name,
        url: p.url,
        default: name === config.default,
      }))
    );
  }

  if (!profiles.length) {
    process.stdout.write('No profiles. Run: sona auth login\n');
    return;
  }

  table(profiles, [
    { header: 'profile', value: ([name]) => (name === config.default ? `${name} ${dim('(default)')}` : name) },
    { header: 'url', value: ([, p]) => p.url || DEFAULT_URL },
  ]);
}
