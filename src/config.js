import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';

const DIR = join(homedir(), '.sona');
const FILE = join(DIR, 'config.json');

export const DEFAULT_URL = 'https://api.sona.to/v1';

export function read() {
  if (!existsSync(FILE)) return { profiles: {} };
  try {
    const parsed = JSON.parse(readFileSync(FILE, 'utf8'));
    return { profiles: {}, ...parsed };
  } catch {
    throw new Error(`Could not read ${FILE}. It is not valid JSON.`);
  }
}

export function write(config) {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  writeFileSync(FILE, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  // writeFileSync only applies mode on create, so an existing file keeps its
  // old permissions without this.
  chmodSync(FILE, 0o600);
}

export function configPath() {
  return FILE;
}

/**
 * Resolution order. The environment wins so CI can run without a config file,
 * and so a token can be supplied without ever touching disk.
 *
 * A --token flag is deliberately not offered: it would land in shell history
 * and be visible in the process list to every user on the machine.
 */
export function resolve(profileName) {
  const url = process.env.SONA_API_URL || DEFAULT_URL;

  if (process.env.SONA_TOKEN) {
    return { token: process.env.SONA_TOKEN, url, source: 'SONA_TOKEN' };
  }

  const config = read();
  const name = profileName || process.env.SONA_PROFILE || config.default || 'default';
  const profile = config.profiles?.[name];

  if (!profile?.token) {
    const hint = profileName
      ? `No profile named "${name}".`
      : 'Not logged in.';
    const error = new Error(`${hint} Run: sona auth login`);
    error.code = 'NO_TOKEN';
    throw error;
  }

  return { token: profile.token, url: profile.url || url, source: `profile "${name}"`, profile: name };
}

export function saveProfile(name, token, url) {
  const config = read();
  config.profiles ||= {};
  config.profiles[name] = { token, url };
  config.default ||= name;
  write(config);
}

export function removeProfile(name) {
  const config = read();
  if (!config.profiles?.[name]) return false;
  delete config.profiles[name];
  if (config.default === name) {
    config.default = Object.keys(config.profiles)[0];
    if (!config.default) delete config.default;
  }
  write(config);
  return true;
}
