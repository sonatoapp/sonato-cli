import { request } from '../client.js';
import { bold, dim, green, red, yellow, json, table, truncate } from '../output.js';

const SEV_COLOUR = { high: red, medium: yellow, low: dim };
function colourSeverity(sev) {
  return (SEV_COLOUR[sev] || ((s) => s))(sev);
}

export async function seo(ctx, args) {
  const sub = args.positionals[1];

  if (sub === 'projects' || sub === undefined) {
    return projects(ctx, args);
  }
  if (sub === 'project') {
    return project(ctx, args);
  }
  if (sub === 'issues') {
    return issues(ctx, args);
  }
  if (sub === 'pages') {
    return pages(ctx, args);
  }
  if (sub === 'audit') {
    return audit(ctx, args);
  }
  if (sub === 'fix') {
    return fix(ctx, args);
  }
  if (sub === 'create') {
    return create(ctx, args);
  }
  throw usage(`Unknown command: sona seo ${sub}`);
}

async function projects(ctx, args) {
  const { data } = await request(ctx, 'GET', '/seo/projects');

  if (args.values.json) return json(data);

  if (!data.length) {
    process.stdout.write('No SEO projects.\n');
    return;
  }

  table(data, [
    { header: 'id', value: (p) => p.id },
    { header: 'domain', value: (p) => truncate(p.domain, 30) },
    { header: 'audit', value: (p) => p.audit_status },
    { header: 'open issues', value: (p) => p.open_issues },
  ]);
}

async function project(ctx, args) {
  const id = args.positionals[2];
  if (!id) throw usage('sona seo project <id>');

  const { data } = await request(ctx, 'GET', `/seo/projects/${encodeURIComponent(id)}`);

  if (args.values.json) return json(data);

  const sev = data.issues.open_by_severity;
  const st = data.issues.by_status;

  process.stdout.write(
    `${bold(data.domain)}  ${dim(data.id)}\n` +
      `${dim('audit')}   ${data.audit_status}\n` +
      `${dim('open')}    ${colourSeverity('high')} ${sev.high}  ${colourSeverity('medium')} ${sev.medium}  ${colourSeverity('low')} ${sev.low}\n` +
      `${dim('status')}  open ${st.open}  applied ${st.applied}  dismissed ${st.dismissed}\n`
  );
}

async function issues(ctx, args) {
  const id = args.positionals[2];
  if (!id) throw usage('sona seo issues <id> [--severity high] [--status open] [--quick-win]');

  const { data, meta } = await request(ctx, 'GET', `/seo/projects/${encodeURIComponent(id)}/issues`, {
    query: {
      severity: args.values.severity,
      status: args.values.status,
      lane: args.values.lane,
      type: args.values['issue-type'],
      quick_win: args.values['quick-win'] ? 'true' : undefined,
      limit: args.values.limit,
      offset: args.values.offset,
    },
  });

  if (args.values.json) return json(data);

  if (!data.length) {
    process.stdout.write('No issues.\n');
    return;
  }

  table(data, [
    { header: 'severity', value: (i) => colourSeverity(i.severity) },
    { header: 'type', value: (i) => i.type },
    { header: 'status', value: (i) => i.status },
    { header: 'quick win', value: (i) => (i.quick_win ? 'yes' : '') },
    { header: 'page', value: (i) => truncate(i.page_url || '', 32) },
  ]);

  if (meta && meta.total > data.length) {
    process.stdout.write(dim(`\n${data.length} of ${meta.total}. Use --offset to see more.\n`));
  }
}

async function pages(ctx, args) {
  const id = args.positionals[2];
  if (!id) throw usage('sona seo pages <id>');

  const { data, meta } = await request(ctx, 'GET', `/seo/projects/${encodeURIComponent(id)}/pages`, {
    query: { limit: args.values.limit, offset: args.values.offset },
  });

  if (args.values.json) return json(data);

  if (!data.length) {
    process.stdout.write('No pages.\n');
    return;
  }

  table(data, [
    { header: 'status', value: (p) => p.status_code },
    { header: 'words', value: (p) => p.word_count },
    { header: 'schema', value: (p) => (p.has_schema ? 'yes' : '') },
    { header: 'url', value: (p) => truncate(p.url, 44) },
  ]);

  if (meta && meta.total > data.length) {
    process.stdout.write(dim(`\n${data.length} of ${meta.total}. Use --offset to see more.\n`));
  }
}

async function audit(ctx, args) {
  const id = args.positionals[2];
  if (!id) throw usage('sona seo audit <id>');

  const { data } = await request(ctx, 'POST', `/seo/projects/${encodeURIComponent(id)}/audit`);

  if (args.values.json) return json(data);

  process.stdout.write(
    `${green('Audit queued')} for ${data.id}.\n` +
      dim('Poll with: sona seo project ' + data.id + '  (audit reaches "done")\n')
  );
}

async function fix(ctx, args) {
  const id = args.positionals[2];
  const issueId = args.positionals[3];
  if (!id || !issueId) throw usage('sona seo fix <project-id> <issue-id>');

  const { data } = await request(ctx, 'POST',
    `/seo/projects/${encodeURIComponent(id)}/issues/${encodeURIComponent(issueId)}/fix`);

  if (args.values.json) return json(data);

  process.stdout.write(
    `${green('Fix generated')} (${data.fix_type}) for issue ${data.issue_id}.\n\n` +
      `${dim('before')}  ${data.before || dim('(empty)')}\n` +
      `${dim('after')}   ${bold(data.after)}\n\n` +
      dim('Apply this change on your own site.\n')
  );
}

async function create(ctx, args) {
  const domain = args.positionals[2];
  if (!domain) throw usage('sona seo create <domain>');

  const { data } = await request(ctx, 'POST', '/seo/projects', { body: { domain } });

  if (args.values.json) return json(data);

  process.stdout.write(
    `${green('Project created')} ${bold(data.domain)}  ${dim(data.id)}\n` +
      dim('Start the first audit with: sona seo audit ' + data.id + '\n')
  );
}

function usage(message) {
  const error = new Error(message);
  error.usage = true;
  return error;
}
