// Colour only when writing to a terminal, so piped output stays clean and
// NO_COLOR is honoured.
const tty = process.stdout.isTTY && !process.env.NO_COLOR;

const wrap = (code) => (s) => (tty ? `\u001b[${code}m${s}\u001b[0m` : String(s));

export const dim = wrap('2');
export const bold = wrap('1');
export const green = wrap('32');
export const red = wrap('31');
export const yellow = wrap('33');

const STATUS_COLOUR = {
  published: green,
  failed: red,
  scheduled: yellow,
  processing: yellow,
  draft: dim,
  awaiting_approval: yellow,
};

export function colourStatus(status) {
  return (STATUS_COLOUR[status] || ((s) => s))(status);
}

export function json(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

/** Visible width, ignoring the escape sequences added above. */
function width(s) {
  return String(s).replace(/\u001b\[\d+m/g, '').length;
}

export function table(rows, columns) {
  if (!rows.length) return;

  const widths = columns.map((col) =>
    Math.max(width(col.header), ...rows.map((r) => width(col.value(r) ?? '')))
  );

  const line = (cells) =>
    cells
      .map((cell, i) =>
        i === cells.length - 1
          ? String(cell)
          : String(cell) + ' '.repeat(Math.max(0, widths[i] - width(cell)))
      )
      .join('  ')
      .trimEnd();

  process.stdout.write(line(columns.map((c) => dim(c.header.toUpperCase()))) + '\n');

  for (const row of rows) {
    process.stdout.write(line(columns.map((c) => c.value(row) ?? '')) + '\n');
  }
}

/** ISO 8601 to something readable, keeping the offset the API sent. */
export function shortDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso;
  const [, , month, day, hour, minute] = m;
  return `${day}/${month} ${hour}:${minute}`;
}

export function truncate(s, max) {
  const value = String(s ?? '').replace(/\s+/g, ' ').trim();
  return value.length > max ? value.slice(0, max - 1) + '\u2026' : value;
}
