import { request } from '../client.js';
import { bold, dim, json, table, truncate } from '../output.js';

const limitText = (n) => (Number(n) < 0 ? 'unlimited' : Number(n).toLocaleString('en-US'));

export async function whoami(ctx, args) {
  const { data } = await request(ctx, 'GET', '/me');

  if (args.values.json) return json(data);

  const scopes = Object.entries(data.scopes)
    .filter(([, on]) => on)
    .map(([name]) => name)
    .join(', ') || 'none';

  // Pad on the label text, not the coloured string, so the escape codes do
  // not throw the alignment out.
  const row = (label, value) => `${dim(label.padEnd(10))}${value}\n`;

  process.stdout.write(
    `${bold(data.user.name || data.user.email)}  ${dim(data.user.email)}\n` +
      row('team', data.team.name) +
      row('scopes', scopes) +
      row('per min', limitText(data.limits.requests_per_minute)) +
      row('per month', limitText(data.limits.requests_per_month)) +
      row('token', `${data.token.name} (${data.token.prefix}...)`)
  );
}

export async function accounts(ctx, args) {
  const { data, meta } = await request(ctx, 'GET', '/accounts', {
    query: { limit: args.values.limit, offset: args.values.offset },
  });

  if (args.values.json) return json(data);

  if (!data.length) {
    process.stdout.write('No channels connected.\n');
    return;
  }

  table(data, [
    { header: 'id', value: (a) => a.id },
    { header: 'network', value: (a) => a.network },
    { header: 'name', value: (a) => truncate(a.name, 30) },
    { header: 'username', value: (a) => truncate(a.username || '', 24) },
  ]);

  if (meta && meta.total > data.length) {
    process.stdout.write(dim(`\n${data.length} of ${meta.total}. Use --offset to see more.\n`));
  }
}
