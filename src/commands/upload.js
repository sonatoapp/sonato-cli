import { readFileSync, existsSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { request, ApiError } from '../client.js';
import { bold, dim, green, json, table, truncate } from '../output.js';

// Minimal multipart builder, so the CLI stays dependency-free.
function multipart(files) {
  const boundary = '----sona' + Math.random().toString(36).slice(2);
  const parts = [];

  for (const path of files) {
    const data = readFileSync(path);
    const name = basename(path);
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="files[]"; filename="${name}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
    ));
    parts.push(data);
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return { body: Buffer.concat(parts), boundary };
}

export async function upload(ctx, args) {
  const paths = args.positionals.slice(1);
  if (!paths.length) throw usage('sona upload <file> [file...]');

  for (const p of paths) {
    if (!existsSync(p)) throw new Error(`File not found: ${p}`);
    if (statSync(p).isDirectory()) throw new Error(`Not a file: ${p}`);
  }

  const { body, boundary } = multipart(paths);

  // request() sets JSON headers when given a body object; here we need raw
  // multipart, so call fetch through the same context but build it directly.
  const url = ctx.url.replace(/\/+$/, '') + '/files';
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        Accept: 'application/json',
        'User-Agent': 'sonato-cli',
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
  } catch (cause) {
    throw new Error(`Could not reach ${new URL(url).origin}. ${cause.message}`);
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Unexpected response from the server (${response.status}).`);
  }

  if (!response.ok) {
    const code = payload?.error?.code || 'error';
    const message = payload?.error?.message || `HTTP ${response.status}`;
    throw new ApiError(response.status, code, message,
      Number(response.headers.get('retry-after')) || undefined);
  }

  const data = payload.data;

  if (args.values.json) return json(data);

  process.stdout.write(`${green('Uploaded')} ${data.length} file${data.length === 1 ? '' : 's'}.\n\n`);
  table(data, [
    { header: 'name', value: (f) => truncate(f.name, 28) },
    { header: 'url', value: (f) => f.url },
  ]);
  process.stdout.write(dim('\nUse a url in the media array of a post to publish it.\n'));
}

function usage(message) {
  const error = new Error(message);
  error.usage = true;
  return error;
}
