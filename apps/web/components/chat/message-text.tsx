import type { ReactNode } from 'react';

// A deliberately small Markdown subset for assistant replies: paragraphs, bullet/numbered lists,
// pipe tables, **bold** and [links](https://…). No HTML and no images are ever rendered
// (SYSTEM_DESIGN §9.6: no external images, links open in a new tab).

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    if (m[1] !== undefined) {
      out.push(
        <strong key={`${keyBase}-b${i}`} className="font-normal">
          {m[1]}
        </strong>,
      );
    } else if (m[2] !== undefined && m[3] !== undefined) {
      out.push(
        <a
          key={`${keyBase}-a${i}`}
          href={m[3]}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-accent underline underline-offset-2"
        >
          {m[2]}
        </a>,
      );
    }
    last = start + m[0].length;
    i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;
const TABLE_SEP = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

type Segment = { kind: 'table' | 'list' | 'text'; lines: string[] };

function lineKind(line: string): Segment['kind'] {
  const t = line.trim();
  if (t.startsWith('|')) return 'table';
  if (BULLET.test(line)) return 'list';
  return 'text';
}

function segments(block: string): Segment[] {
  const out: Segment[] = [];
  for (const line of block.split('\n')) {
    if (line.trim().length === 0) continue;
    const kind = lineKind(line);
    const prev = out[out.length - 1];
    if (prev && prev.kind === kind) prev.lines.push(line);
    else out.push({ kind, lines: [line] });
  }
  return out;
}

function renderTable(lines: string[], key: string): ReactNode {
  const [head, ...rest] = lines;
  const body = rest.filter((l) => !TABLE_SEP.test(l.trim()));
  return (
    <div key={key} className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-label">
        <thead>
          <tr className="bg-raised">
            {cells(head ?? '').map((c, i) => (
              <th key={i} scope="col" className="px-2 py-1 text-left font-normal text-muted">
                {renderInline(c, `${key}-h${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {body.map((row, r) => (
            <tr key={r} className="border-t border-rule">
              {cells(row).map((c, i) => (
                <td key={i} className="px-2 py-1">
                  {renderInline(c, `${key}-r${r}c${i}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderSegment(seg: Segment, key: string): ReactNode {
  if (seg.kind === 'table' && seg.lines.length >= 2) return renderTable(seg.lines, key);
  if (seg.kind === 'list') {
    const ordered = /^\s*\d/.test(seg.lines[0] ?? '');
    const items = seg.lines.map((l, i) => <li key={i}>{renderInline(l.replace(BULLET, ''), `${key}-li${i}`)}</li>);
    return ordered ? (
      <ol key={key} className="list-decimal space-y-1 pl-5">
        {items}
      </ol>
    ) : (
      <ul key={key} className="list-disc space-y-1 pl-5">
        {items}
      </ul>
    );
  }
  return (
    <p key={key} className="whitespace-pre-wrap">
      {renderInline(seg.lines.map((l) => l.replace(/^#{1,6}\s+/, '')).join('\n'), key)}
    </p>
  );
}

export function MessageText({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-2">
      {blocks.flatMap((b, i) => segments(b).map((seg, j) => renderSegment(seg, `b${i}s${j}`)))}
    </div>
  );
}
