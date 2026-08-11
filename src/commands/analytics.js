import { request } from '../client.js';
import { bold, dim, json, table, truncate } from '../output.js';

function fmt(n) {
  if (n === null || n === undefined) return '-';
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  // whole numbers plain, decimals to one place
  return Number.isInteger(num) ? num.toLocaleString('en-US') : num.toFixed(1);
}

export async function analytics(ctx, args) {
  const account = args.positionals[1];
  if (!account) throw usage('sona analytics <account> [--since YYYY-MM-DD] [--until YYYY-MM-DD]');

  const { data } = await request(ctx, 'GET', `/analytics/${encodeURIComponent(account)}`, {
    query: { since: args.values.since, until: args.values.until },
  });

  if (args.values.json) return json(data);

  const a = data.account;
  process.stdout.write(
    `${bold(a.name || a.id)}  ${dim(a.network)}\n` +
      `${dim('range')}  ${data.range.since} to ${data.range.until}\n\n`
  );

  if (!data.metrics.length) {
    process.stdout.write(dim('No metrics in this range.\n'));
    return;
  }

  table(data.metrics, [
    { header: 'metric', value: (m) => truncate(m.key, 32) },
    {
      header: 'total',
      value: (m) => (m.total === null ? dim('see latest/sum') : fmt(m.total)),
    },
    { header: 'latest', value: (m) => fmt(m.latest) },
    { header: 'sum', value: (m) => fmt(m.sum) },
    { header: 'days', value: (m) => m.series.length },
  ]);

  const ambiguous = data.metrics.filter((m) => m.aggregation === null).length;
  if (ambiguous) {
    process.stdout.write(
      dim(`\n${ambiguous} metric${ambiguous === 1 ? '' : 's'} have no single meaningful total. ` +
        `Both latest and sum are shown so you can choose.\n`)
    );
  }
}

function usage(message) {
  const error = new Error(message);
  error.usage = true;
  return error;
}
