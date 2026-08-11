#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { resolve } from '../src/config.js';
import { ApiError } from '../src/client.js';
import { bold, dim, red } from '../src/output.js';
import * as auth from '../src/commands/auth.js';
import * as account from '../src/commands/account.js';
import * as post from '../src/commands/post.js';
import * as analytics from '../src/commands/analytics.js';
import * as upload from '../src/commands/upload.js';
import * as seo from '../src/commands/seo.js';

const OPTIONS = {
  json: { type: 'boolean', default: false },
  profile: { type: 'string' },
  limit: { type: 'string' },
  offset: { type: 'string' },
  status: { type: 'string' },
  'quick-win': { type: 'boolean', default: false },
  lane: { type: 'string' },
  severity: { type: 'string' },
  'issue-type': { type: 'string' },
  since: { type: 'string' },
  until: { type: 'string' },
  account: { type: 'string', multiple: true },
  text: { type: 'string' },
  link: { type: 'string' },
  media: { type: 'string', multiple: true },
  at: { type: 'string' },
  help: { type: 'boolean', short: 'h', default: false },
  version: { type: 'boolean', short: 'v', default: false },
};

const HELP = `${bold('sona')} - command line client for sona.to

${dim('USAGE')}
  sona <command> [options]

${dim('COMMANDS')}
  auth login              Save a token for later commands
  auth logout             Forget a saved token
  auth list               Show saved profiles
  whoami                  Show the account a token belongs to
  accounts                List connected channels
  analytics <account>     Show metrics for a channel
  upload <file...>        Upload media, get urls for posting
  seo create <domain>     Add a site to audit
  seo projects            List SEO projects
  seo project <id>        Show one project's issue summary
  seo issues <id>         List issues for a project
  seo pages <id>          List crawled pages
  seo audit <id>          Start an audit for a project
  seo fix <id> <issue>    Generate a fix for an issue
  post list               List posts
  post get <id>           Show one post
  post create             Publish or schedule a post
  post edit <id>          Change a scheduled post
  post cancel <id>        Cancel a scheduled post

${dim('OPTIONS')}
  --json                  Print raw JSON, for piping into other tools
  --profile <name>        Use a named profile
  --limit <n>             Rows to return
  --offset <n>            Rows to skip
  --status <state>        draft, awaiting_approval, scheduled, processing, published, failed
  --issue-type <type>     Filter SEO issues by type (e.g. missing_title)
  --since <date>          Start date for analytics, YYYY-MM-DD
  --until <date>          End date for analytics, YYYY-MM-DD
  --account <id>          Channel id, repeat for several
  --text <text>           Post text
  --link <url>            Link to share
  --media <url>           Image or video url, repeat for several
  --at <time>             ISO 8601 time to publish, for example 2026-08-01T09:00:00+07:00
  -h, --help              Show this
  -v, --version           Show the version

${dim('ENVIRONMENT')}
  SONA_TOKEN              Use this token instead of a saved profile
  SONA_PROFILE            Profile to use by default
  SONA_API_URL            Point at a different install
  NO_COLOR                Turn off colour

${dim('EXAMPLES')}
  sona accounts
  sona post list --status scheduled
  sona analytics acc_00000002 --since 2026-06-01
  sona upload photo.jpg
  sona upload a.jpg b.jpg --json
  sona seo projects
  sona seo issues seo_abc123 --severity high --quick-win
  sona post create --account acc_00000002 --text "Doors open at nine tomorrow."
  sona post create --account acc_00000002 --text "Sale ends Friday." --at 2026-08-01T09:00:00+07:00
  sona post list --json | jq '.[] | select(.status=="failed")'

${dim('DOCS')}
  https://developers.sona.to
`;

function version() {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
  return pkg.version;
}

// A downstream pipe closing early (sona ... | head) makes stdout emit EPIPE.
// That is normal for a CLI, so exit quietly instead of throwing.
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(0);
  throw err;
});

async function main() {
  let args;
  try {
    args = parseArgs({ options: OPTIONS, allowPositionals: true });
  } catch (error) {
    process.stderr.write(red(error.message) + '\nRun: sona --help\n');
    process.exit(2);
  }

  const [group, action] = args.positionals;

  if (args.values.version) {
    process.stdout.write(version() + '\n');
    return;
  }

  if (args.values.help || !group) {
    process.stdout.write(HELP);
    return;
  }

  // auth runs without a token, since it is what produces one.
  if (group === 'auth') {
    const commands = { login: auth.login, logout: auth.logout, list: auth.list };
    const command = commands[action];
    if (!command) throw usage(`Unknown command: sona auth ${action || ''}`);
    return command(args);
  }

  // The routes are declared before a token is resolved so an unknown command
  // reports itself rather than "Not logged in" when no token is present. Each
  // entry is a thunk, so ctx is only read once one of them actually runs.
  let ctx;

  const routes = {
    whoami: () => account.whoami(ctx, args),
    accounts: () => account.accounts(ctx, args),
    analytics: () => analytics.analytics(ctx, args),
    upload: () => upload.upload(ctx, args),
    seo: () => seo.seo(ctx, args),
    post: () => {
      const commands = {
        list: post.list,
        get: post.get,
        create: post.create,
        edit: post.edit,
        cancel: post.cancel,
      };
      const command = commands[action];
      if (!command) throw usage(`Unknown command: sona post ${action || ''}`);
      return command(ctx, args);
    },
  };

  const route = routes[group];
  if (!route) throw usage(`Unknown command: ${group}`);

  ctx = resolve(args.values.profile);

  return route();
}

function usage(message) {
  const error = new Error(message);
  error.usage = true;
  return error;
}

main().catch((error) => {
  process.stderr.write(red(error.message) + '\n');

  if (error.usage) {
    process.stderr.write('Run: sona --help\n');
    process.exit(2);
  }

  if (error.code === 'NO_TOKEN') process.exit(3);

  if (error instanceof ApiError) {
    if (error.retryAfter) {
      process.stderr.write(dim(`Try again in ${error.retryAfter} seconds.\n`));
    }
    if (error.status === 401 || error.status === 403) process.exit(3);
    if (error.status === 429) process.exit(4);
  }

  process.exit(1);
});
