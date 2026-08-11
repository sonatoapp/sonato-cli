import { createServer } from 'node:http';

// Shapes copied from real responses captured against dev.sona.to, so the CLI
// is tested against what the API actually returns rather than a guess.
const ME = {
  user: { id: 1, name: 'Example User', email: 'user@example.com' },
  team: { id: 1, name: 'test' },
  plan: { id: 19, expires_at: '2028-07-26T17:00:00+00:00' },
  limits: { requests_per_minute: 60, requests_per_month: 50000, max_tokens: 3 },
  scopes: { read: true, write: true },
  token: { name: 'test', prefix: 'sona_00000000' },
};

const ACCOUNTS = [
  { id: 'acc_00000001', network: 'x', module: 'AppChannelXProfiles', name: 'Example Account', username: 'exampleuser', avatar: null, url: 'https://x.com/exampleuser', can_post: true },
  { id: 'acc_00000002', network: 'telegram', module: 'AppChannelTelegramGroups', name: 'Example Group', username: null, avatar: null, url: null, can_post: true },
];

const POSTS = [
  { id: 'post_0000001', status: 'published', network: 'telegram', type: 'media', caption: "Example caption", link: null, media: ['https://files.sona.to/files/a.png'], account: { id: 'acc_00000002', name: 'Example Group' }, scheduled_at: '2026-06-10T18:48:00+07:00', created_at: '2026-06-10T18:47:31+07:00', published_url: 'https://t.me/example' },
  { id: 'post_0000002', status: 'scheduled', network: 'telegram', type: 'text', caption: 'status split test', link: null, media: [], account: { id: 'acc_00000002', name: 'Example Group' }, scheduled_at: '2026-08-23T16:26:58+07:00', created_at: '2026-07-24T16:27:03+07:00', published_url: null },
];

const err = (res, status, code, message) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code, message } }));
};

const ok = (res, payload, status = 200) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'X-RateLimit-Limit': '60',
    'X-RateLimit-Remaining': '58',
  });
  res.end(JSON.stringify(payload));
};

export function start(port = 8123) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const auth = req.headers.authorization || '';

    if (!auth.startsWith('Bearer ')) {
      return err(res, 401, 'unauthenticated', 'Missing bearer token.');
    }
    const token = auth.slice(7);
    if (token === 'bad') {
      return err(res, 401, 'invalid_token', 'Token not recognised.');
    }
    if (token === 'readonly' && req.method !== 'GET') {
      return err(res, 403, 'insufficient_scope', 'This token does not have the write scope.');
    }
    if (token === 'limited') {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '31' });
      return res.end(JSON.stringify({ error: { code: 'rate_limited', message: 'Too many requests.' } }));
    }

    const path = url.pathname.replace(/^\/api\/v1/, '');
    let body = '';
    for await (const chunk of req) body += chunk;
    const payload = body ? JSON.parse(body) : {};

    if (path === '/me') return ok(res, { data: ME });

    if (path === '/accounts') {
      const limit = Number(url.searchParams.get('limit') || 50);
      return ok(res, {
        data: ACCOUNTS.slice(0, limit),
        meta: { total: 12, limit, offset: 0 },
      });
    }

    if (path === '/posts' && req.method === 'GET') {
      const status = url.searchParams.get('status');
      if (status && !['draft', 'awaiting_approval', 'scheduled', 'processing', 'published', 'failed'].includes(status)) {
        return err(res, 422, 'invalid_parameter', 'Unknown status.');
      }
      const rows = status ? POSTS.filter((p) => p.status === status) : POSTS;
      return ok(res, { data: rows, meta: { total: 572, limit: 50, offset: 0 } });
    }

    if (path === '/posts' && req.method === 'POST') {
      if (!payload.accounts?.length) {
        return err(res, 422, 'invalid_parameter', 'The accounts field is required.');
      }
      const scheduled = Boolean(payload.scheduled_at);
      return ok(res, {
        data: payload.accounts.map((id, i) => ({
          id: `new${i}`,
          status: scheduled ? 'scheduled' : 'published',
          network: 'telegram',
          type: payload.media?.length ? 'media' : payload.link ? 'link' : 'text',
          caption: payload.caption ?? '',
          link: payload.link ?? null,
          media: payload.media ?? [],
          account: { id, name: 'Example Group' },
          scheduled_at: payload.scheduled_at || '2026-07-24T16:29:12+07:00',
          created_at: '2026-07-24T16:29:12+07:00',
          published_url: scheduled ? null : 'https://t.me/example',
        })),
      }, 201);
    }

    const am = path.match(/^\/analytics\/(.+)$/);
    if (am) {
      if (am[1] === 'gone') return err(res, 404, 'not_found', 'Account not found.');
      if (url.searchParams.get('since') === 'bad') return err(res, 422, 'invalid_parameter', 'since and until must be dates.');
      return ok(res, {
        data: {
          account: { id: am[1], network: 'facebook', name: 'Example Page', avatar: null, url: null },
          range: { since: '2026-06-01', until: '2026-06-30' },
          metrics: [
            { key: 'page_impressions', aggregation: 'sum', latest: 1, sum: 64, total: 64,
              series: [{date:'2026-06-01',value:10},{date:'2026-06-02',value:54}] },
            { key: 'member_count', aggregation: 'latest', latest: 1200, sum: 8400, total: 1200,
              series: [{date:'2026-06-01',value:1198},{date:'2026-06-02',value:1200}] },
            { key: 'averageViewDuration', aggregation: null, latest: 19, sum: 133, total: null,
              series: [{date:'2026-06-01',value:19}] },
          ],
        },
      });
    }

    const match = path.match(/^\/posts\/(.+)$/);
    if (match) {
      const found = POSTS.find((p) => p.id === match[1]);
      if (!found) return err(res, 404, 'not_found', 'Post not found.');

      if (req.method === 'GET') return ok(res, { data: found });
      if (req.method === 'DELETE') {
        if (found.status === 'published') return err(res, 409, 'conflict', 'This post has already been published.');
        return ok(res, { data: { id: found.id, deleted: true } });
      }
      if (req.method === 'PATCH') {
        if (found.status !== 'scheduled') return err(res, 409, 'conflict', 'Only scheduled posts can be edited.');
        return ok(res, { data: { ...found, caption: payload.caption ?? found.caption, scheduled_at: payload.scheduled_at ?? found.scheduled_at } });
      }
    }

    return err(res, 404, 'not_found', 'No such endpoint.');
  });

  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[2] === 'run') {
  start().then(() => process.stdout.write('mock on 8123\n'));
}
