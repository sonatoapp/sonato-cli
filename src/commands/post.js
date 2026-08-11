import { request } from '../client.js';
import { bold, colourStatus, dim, green, json, shortDate, table, truncate } from '../output.js';

export async function list(ctx, args) {
  const { data, meta } = await request(ctx, 'GET', '/posts', {
    query: {
      limit: args.values.limit,
      offset: args.values.offset,
      status: args.values.status,
      account: args.values.account?.[0],
    },
  });

  if (args.values.json) return json(data);

  if (!data.length) {
    process.stdout.write('No posts.\n');
    return;
  }

  table(data, [
    { header: 'id', value: (p) => p.id },
    { header: 'status', value: (p) => colourStatus(p.status) },
    { header: 'when', value: (p) => shortDate(p.scheduled_at) },
    { header: 'channel', value: (p) => truncate(p.account?.name || '', 20) },
    { header: 'text', value: (p) => truncate(p.caption || dim('(no caption)'), 44) },
  ]);

  if (meta && meta.total > data.length) {
    process.stdout.write(dim(`\n${data.length} of ${meta.total}. Use --offset to see more.\n`));
  }
}

export async function get(ctx, args) {
  const id = args.positionals[2];
  if (!id) throw usage('sona post get <id>');

  const { data } = await request(ctx, 'GET', `/posts/${encodeURIComponent(id)}`);

  if (args.values.json) return json(data);

  process.stdout.write(
    `${bold(data.id)}  ${colourStatus(data.status)}\n` +
      `${dim('channel')}  ${data.account?.name || ''} (${data.network})\n` +
      `${dim('when')}     ${data.scheduled_at}\n` +
      (data.published_url ? `${dim('url')}      ${data.published_url}\n` : '') +
      (data.link ? `${dim('link')}     ${data.link}\n` : '') +
      (data.media?.length ? `${dim('media')}    ${data.media.length} file(s)\n` : '') +
      `\n${data.caption || dim('(no caption)')}\n`
  );
}

export async function create(ctx, args) {
  const accounts = args.values.account || [];
  if (!accounts.length) throw usage('sona post create --account <id> --text "..."');

  const body = { accounts };

  if (args.values.text !== undefined) body.caption = args.values.text;
  if (args.values.link !== undefined) body.link = args.values.link;
  if (args.values.media?.length) body.media = args.values.media;
  if (args.values.at !== undefined) body.scheduled_at = args.values.at;

  if (!body.caption && !body.link && !body.media) {
    throw usage('Provide --text, --link, or --media.');
  }

  const { data } = await request(ctx, 'POST', '/posts', { body });

  if (args.values.json) return json(data);

  const scheduled = data.some((p) => p.status === 'scheduled');

  process.stdout.write(
    `${green(scheduled ? 'Scheduled' : 'Published')} to ${data.length} channel${data.length === 1 ? '' : 's'}.\n\n`
  );

  table(data, [
    { header: 'id', value: (p) => p.id },
    { header: 'status', value: (p) => colourStatus(p.status) },
    { header: 'channel', value: (p) => truncate(p.account?.name || '', 20) },
    { header: 'url', value: (p) => p.published_url || '' },
  ]);
}

export async function edit(ctx, args) {
  const id = args.positionals[2];
  if (!id) throw usage('sona post edit <id> [--text "..."] [--at <time>]');

  const body = {};
  if (args.values.text !== undefined) body.caption = args.values.text;
  if (args.values.link !== undefined) body.link = args.values.link;
  if (args.values.media?.length) body.media = args.values.media;
  if (args.values.at !== undefined) body.scheduled_at = args.values.at;

  if (!Object.keys(body).length) {
    throw usage('Nothing to change. Pass --text, --link, --media, or --at.');
  }

  const { data } = await request(ctx, 'PATCH', `/posts/${encodeURIComponent(id)}`, { body });

  if (args.values.json) return json(data);

  process.stdout.write(`${green('Updated')} ${data.id}, ${colourStatus(data.status)} for ${data.scheduled_at}.\n`);
}

export async function cancel(ctx, args) {
  const id = args.positionals[2];
  if (!id) throw usage('sona post cancel <id>');

  const { data } = await request(ctx, 'DELETE', `/posts/${encodeURIComponent(id)}`);

  if (args.values.json) return json(data);

  process.stdout.write(`${green('Cancelled')} ${data.id}.\n`);
}

function usage(message) {
  const error = new Error(message);
  error.usage = true;
  return error;
}
