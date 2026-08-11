import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './mock.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, '..', 'bin', 'sona.js');

let server;
let base;
let home;

before(async () => {
  // Port 0 lets the OS pick a free port, so tests never collide with a
  // running mock or with each other.
  server = await start(0);
  base = `http://127.0.0.1:${server.address().port}`;
  // An empty HOME keeps the tests away from a real ~/.sona/config.json.
  home = mkdtempSync(join(tmpdir(), 'sona-test-'));
});

after(() => {
  server?.close();
  if (home) rmSync(home, { recursive: true, force: true });
});

/** Runs the real binary as a subprocess and resolves with its result. */
function run(args, { token = 'test' } = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      {
        env: {
          PATH: process.env.PATH,
          HOME: home,
          NO_COLOR: '1',
          SONA_API_URL: base,
          ...(token === null ? {} : { SONA_TOKEN: token }),
        },
      },
      (error, stdout, stderr) => {
        resolve({ code: error?.code ?? 0, stdout, stderr });
      }
    );
  });
}

test('--version prints the package version', async () => {
  const { code, stdout } = await run(['--version']);
  assert.equal(code, 0);
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('--help lists every command group', async () => {
  const { code, stdout } = await run(['--help']);
  assert.equal(code, 0);
  for (const cmd of ['auth login', 'whoami', 'accounts', 'analytics', 'upload', 'seo create', 'seo audit', 'post create']) {
    assert.ok(stdout.includes(cmd), `help is missing "${cmd}"`);
  }
});

test('no arguments prints help rather than erroring', async () => {
  const { code, stdout } = await run([]);
  assert.equal(code, 0);
  assert.ok(stdout.includes('USAGE'));
});

test('whoami shows the account and token', async () => {
  const { code, stdout } = await run(['whoami']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('user@example.com'));
  assert.ok(stdout.includes('sona_00000000'));
});

test('whoami --json emits valid parseable JSON', async () => {
  const { code, stdout } = await run(['whoami', '--json']);
  assert.equal(code, 0);
  const data = JSON.parse(stdout);
  assert.equal(data.user.email, 'user@example.com');
  assert.equal(data.scopes.write, true);
});

test('accounts lists channels and notes there are more', async () => {
  const { code, stdout } = await run(['accounts']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('acc_00000001'));
  assert.ok(stdout.includes('telegram'));
  assert.ok(stdout.includes('of 12'), 'should report the total from meta');
});

test('post list shows both posts', async () => {
  const { code, stdout } = await run(['post', 'list']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('post_0000001'));
  assert.ok(stdout.includes('post_0000002'));
});

test('post list --status scheduled filters server side', async () => {
  const { code, stdout } = await run(['post', 'list', '--status', 'scheduled']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('post_0000002'));
  assert.ok(!stdout.includes('post_0000001'), 'published post should be filtered out');
});

test('post get shows one post in detail', async () => {
  const { code, stdout } = await run(['post', 'get', 'post_0000001']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('Example caption'));
  assert.ok(stdout.includes('https://t.me/example'));
});

test('post get on a missing id exits 1', async () => {
  const { code, stderr } = await run(['post', 'get', 'nope']);
  assert.equal(code, 1);
  assert.ok(stderr.includes('not found') || stderr.includes('Post not found'));
});

test('post create without --account is a usage error, exit 2', async () => {
  const { code, stderr } = await run(['post', 'create', '--text', 'hi']);
  assert.equal(code, 2);
  assert.ok(stderr.includes('--account'));
});

test('post create with no content is a usage error, exit 2', async () => {
  const { code, stderr } = await run(['post', 'create', '--account', 'acc_00000002']);
  assert.equal(code, 2);
  assert.ok(stderr.includes('--text'));
});

test('post create publishes immediately without --at', async () => {
  const { code, stdout } = await run(['post', 'create', '--account', 'acc_00000002', '--text', 'hello']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('Published'));
  assert.ok(!stdout.includes('Scheduled'));
});

test('post create with --at schedules instead', async () => {
  const { code, stdout } = await run([
    'post', 'create', '--account', 'acc_00000002', '--text', 'later', '--at', '2026-09-01T09:00:00+07:00',
  ]);
  assert.equal(code, 0);
  assert.ok(stdout.includes('Scheduled'));
});

test('post create accepts several --account flags', async () => {
  const { code, stdout } = await run([
    'post', 'create', '--account', 'acc_00000001', '--account', 'acc_00000002', '--text', 'both',
  ]);
  assert.equal(code, 0);
  assert.ok(stdout.includes('2 channels'));
});

test('post edit changes a scheduled post', async () => {
  const { code, stdout } = await run(['post', 'edit', 'post_0000002', '--text', 'changed']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('Updated'));
});

test('post edit on a published post conflicts, exit 1', async () => {
  const { code, stderr } = await run(['post', 'edit', 'post_0000001', '--text', 'nope']);
  assert.equal(code, 1);
  assert.ok(stderr.includes('scheduled'));
});

test('post edit with nothing to change is a usage error, exit 2', async () => {
  const { code, stderr } = await run(['post', 'edit', 'post_0000002']);
  assert.equal(code, 2);
  assert.ok(stderr.includes('Nothing to change'));
});

test('post cancel removes a scheduled post', async () => {
  const { code, stdout } = await run(['post', 'cancel', 'post_0000002']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('Cancelled'));
});

test('post cancel on a published post conflicts, exit 1', async () => {
  const { code } = await run(['post', 'cancel', 'post_0000001']);
  assert.equal(code, 1);
});

test('unknown post subcommand is a usage error, exit 2', async () => {
  const { code, stderr } = await run(['post', 'frobnicate']);
  assert.equal(code, 2);
  assert.ok(stderr.includes('Unknown command'));
});

test('analytics renders the metric table', async () => {
  const { code, stdout } = await run(['analytics', 'acc_00000002']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('page_impressions'));
  assert.ok(stdout.includes('2026-06-01 to 2026-06-30'));
});

test('analytics explains metrics with no meaningful total', async () => {
  const { stdout } = await run(['analytics', 'acc_00000002']);
  assert.ok(stdout.includes('no single meaningful total'));
});

test('analytics without an account is a usage error, exit 2', async () => {
  const { code, stderr } = await run(['analytics']);
  assert.equal(code, 2);
  assert.ok(stderr.includes('sona analytics'));
});

test('analytics on a missing account exits 1', async () => {
  const { code } = await run(['analytics', 'gone']);
  assert.equal(code, 1);
});

test('seo projects lists projects', async () => {
  const { code, stdout } = await run(['seo', 'projects']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('seo_00000001'));
  assert.ok(stdout.includes('example.com'));
});

test('bare seo defaults to listing projects', async () => {
  const { code, stdout } = await run(['seo']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('seo_00000001'));
});

test('seo project shows the issue summary', async () => {
  const { code, stdout } = await run(['seo', 'project', 'seo_00000001']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('example.com'));
  assert.ok(stdout.includes('applied 2'));
});

test('seo issues lists issues', async () => {
  const { code, stdout } = await run(['seo', 'issues', 'seo_00000001']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('missing_title'));
  assert.ok(stdout.includes('thin_content'));
});

test('seo issues --severity high filters', async () => {
  const { code, stdout } = await run(['seo', 'issues', 'seo_00000001', '--severity', 'high']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('missing_title'));
  assert.ok(!stdout.includes('thin_content'));
});

test('seo issues --quick-win filters', async () => {
  const { stdout } = await run(['seo', 'issues', 'seo_00000001', '--quick-win']);
  assert.ok(stdout.includes('missing_title'));
  assert.ok(!stdout.includes('missing_schema'));
});

test('seo issues --issue-type filters', async () => {
  const { stdout } = await run(['seo', 'issues', 'seo_00000001', '--issue-type', 'thin_content']);
  assert.ok(stdout.includes('thin_content'));
  assert.ok(!stdout.includes('missing_title'));
});

test('seo pages lists crawled pages', async () => {
  const { code, stdout } = await run(['seo', 'pages', 'seo_00000001']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('example.com/pricing'));
});

test('seo audit queues an audit', async () => {
  const { code, stdout } = await run(['seo', 'audit', 'seo_00000001']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('Audit queued'));
});

test('seo audit without an id is a usage error, exit 2', async () => {
  const { code, stderr } = await run(['seo', 'audit']);
  assert.equal(code, 2);
  assert.ok(stderr.includes('sona seo audit'));
});

test('seo fix generates a fix and shows before and after', async () => {
  const { code, stdout } = await run(['seo', 'fix', 'seo_00000001', '1']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('Fix generated'));
  assert.ok(stdout.includes('About us | Example'));
});

test('seo fix without an issue id is a usage error, exit 2', async () => {
  const { code, stderr } = await run(['seo', 'fix', 'seo_00000001']);
  assert.equal(code, 2);
  assert.ok(stderr.includes('issue-id'));
});

test('seo create adds a project', async () => {
  const { code, stdout } = await run(['seo', 'create', 'newsite.com']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('Project created'));
  assert.ok(stdout.includes('newsite.com'));
  assert.ok(stdout.includes('seo_00000002'));
});

test('seo create without a domain is a usage error, exit 2', async () => {
  const { code, stderr } = await run(['seo', 'create']);
  assert.equal(code, 2);
  assert.ok(stderr.includes('sona seo create'));
});

test('seo create on a duplicate domain exits 1', async () => {
  const { code, stderr } = await run(['seo', 'create', 'taken.com']);
  assert.equal(code, 1);
  assert.ok(stderr.includes('already'));
});

test('unknown seo subcommand is a usage error, exit 2', async () => {
  const { code, stderr } = await run(['seo', 'frobnicate']);
  assert.equal(code, 2);
  assert.ok(stderr.includes('Unknown command'));
});

test('a rejected token exits 3 and points at auth login', async () => {
  const { code, stderr } = await run(['whoami'], { token: 'bad' });
  assert.equal(code, 3);
  assert.ok(stderr.includes('sona auth login'));
});

test('a read-only token cannot write, exits 3', async () => {
  const { code, stderr } = await run(
    ['post', 'create', '--account', 'acc_00000002', '--text', 'hi'],
    { token: 'readonly' }
  );
  assert.equal(code, 3);
  assert.ok(stderr.includes('write'));
});

test('rate limiting exits 4 and surfaces Retry-After', async () => {
  const { code, stderr } = await run(['whoami'], { token: 'limited' });
  assert.equal(code, 4);
  assert.ok(stderr.includes('31'), 'should show the retry delay');
});

test('no token at all exits 3', async () => {
  const { code, stderr } = await run(['whoami'], { token: null });
  assert.equal(code, 3);
  assert.ok(stderr.includes('auth login'));
});

test('auth list with no profiles says so', async () => {
  const { code, stdout } = await run(['auth', 'list'], { token: null });
  assert.equal(code, 0);
  assert.ok(stdout.includes('No profiles'));
});

test('unknown auth subcommand is a usage error, exit 2', async () => {
  const { code, stderr } = await run(['auth', 'frobnicate'], { token: null });
  assert.equal(code, 2);
  assert.ok(stderr.includes('Unknown command'));
});

test('an unknown top-level command is a usage error, exit 2', async () => {
  const { code, stderr } = await run(['frobnicate']);
  assert.equal(code, 2);
  assert.ok(stderr.includes('Unknown command'));
});

test('an unknown command reports itself even when logged out, exit 2', async () => {
  const { code, stderr } = await run(['frobnicate'], { token: null });
  assert.equal(code, 2);
  assert.ok(stderr.includes('Unknown command'), 'should not say "Not logged in"');
});

test('an unparseable flag is a usage error, exit 2', async () => {
  const { code, stderr } = await run(['--nonsense']);
  assert.equal(code, 2);
  assert.ok(stderr.includes('help'));
});

test('upload with no files is a usage error, exit 2', async () => {
  const { code, stderr } = await run(['upload']);
  assert.equal(code, 2);
  assert.ok(stderr.includes('sona upload'));
});

test('upload of a missing file fails clearly, exit 1', async () => {
  const { code, stderr } = await run(['upload', '/definitely/not/here.jpg']);
  assert.equal(code, 1);
  assert.ok(stderr.includes('File not found'));
});
