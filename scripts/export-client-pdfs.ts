import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

type DocSpec = {
  input: string;
  output: string;
  title: string;
  subtitle: string;
};

const ROOT = process.cwd();
const GENERATED_DIR = join(ROOT, 'generated');

const DOCS: DocSpec[] = [
  {
    input: join(GENERATED_DIR, 'client-timeline-delay.md'),
    output: join(GENERATED_DIR, 'client-timeline-delay.pdf'),
    title: 'Client Email: Timeline Delay',
    subtitle: 'Client-style source for demo ingestion',
  },
  {
    input: join(GENERATED_DIR, 'client-budget-summary.md'),
    output: join(GENERATED_DIR, 'client-budget-summary.pdf'),
    title: 'Internal Memo: Budget Summary',
    subtitle: 'Client-style source for demo ingestion',
  },
  {
    input: join(GENERATED_DIR, 'client-final-feedback.md'),
    output: join(GENERATED_DIR, 'client-final-feedback.pdf'),
    title: 'Client Feedback: Final Review',
    subtitle: 'Client-style source for demo ingestion',
  },
];

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function inlineFormat(text: string): string {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\`([^`]+)\`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let ul: string[] = [];
  let ol: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(`<p>${paragraph.map(inlineFormat).join('<br />')}</p>`);
      paragraph = [];
    }
  };

  const flushList = (type: 'ul' | 'ol') => {
    const list = type === 'ul' ? ul : ol;
    if (list.length > 0) {
      const tag = type === 'ul' ? 'ul' : 'ol';
      blocks.push(`<${tag}>${list.map((item) => `<li>${inlineFormat(item)}</li>`).join('')}</${tag}>`);
      if (type === 'ul') ul = [];
      else ol = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList('ul');
      flushList('ol');
      continue;
    }

    if (line.startsWith('# ')) {
      flushParagraph();
      flushList('ul');
      flushList('ol');
      blocks.push(`<h1>${inlineFormat(line.slice(2).trim())}</h1>`);
      continue;
    }

    if (line.startsWith('## ')) {
      flushParagraph();
      flushList('ul');
      flushList('ol');
      blocks.push(`<h2>${inlineFormat(line.slice(3).trim())}</h2>`);
      continue;
    }

    if (line.startsWith('### ')) {
      flushParagraph();
      flushList('ul');
      flushList('ol');
      blocks.push(`<h3>${inlineFormat(line.slice(4).trim())}</h3>`);
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      flushList('ol');
      ul.push(bulletMatch[1]);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      flushList('ul');
      ol.push(orderedMatch[1]);
      continue;
    }

    flushList('ul');
    flushList('ol');
    paragraph.push(line);
  }

  flushParagraph();
  flushList('ul');
  flushList('ol');

  return blocks.join('\n');
}

function buildDocument(title: string, subtitle: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page {
        size: A4;
        margin: 18mm 16mm 18mm 16mm;
      }
      :root {
        color-scheme: light;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Thai', 'Helvetica Neue', Arial, sans-serif;
        color: #111827;
        background: #ffffff;
        -webkit-font-smoothing: antialiased;
        text-rendering: geometricPrecision;
      }
      .page {
        min-height: 100vh;
        padding: 0;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 14px;
        margin-bottom: 20px;
      }
      .eyebrow {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: #6b7280;
        margin: 0 0 8px;
      }
      h1 {
        font-size: 24px;
        line-height: 1.2;
        margin: 0;
      }
      .subtitle {
        margin-top: 8px;
        color: #4b5563;
        font-size: 13px;
      }
      .meta {
        text-align: right;
        font-size: 12px;
        color: #6b7280;
        line-height: 1.6;
        padding-left: 24px;
        white-space: nowrap;
      }
      h2 {
        font-size: 16px;
        margin: 22px 0 10px;
      }
      h3 {
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #374151;
        margin: 18px 0 8px;
      }
      p {
        margin: 0 0 12px;
        font-size: 13.5px;
        line-height: 1.7;
        white-space: pre-wrap;
      }
      ul, ol {
        margin: 0 0 14px 22px;
        padding: 0;
      }
      li {
        margin: 0 0 8px;
        font-size: 13.5px;
        line-height: 1.6;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
        font-size: 0.95em;
        background: #f3f4f6;
        padding: 0.08em 0.35em;
        border-radius: 0.35em;
      }
      strong { font-weight: 700; }
      em { font-style: italic; }
      .footer {
        margin-top: 18px;
        border-top: 1px solid #e5e7eb;
        padding-top: 10px;
        color: #6b7280;
        font-size: 11px;
      }
      .callout {
        border: 1px solid #d1d5db;
        border-radius: 14px;
        padding: 14px 16px;
        margin: 14px 0 18px;
        background: #fafafa;
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="header">
        <div>
          <p class="eyebrow">MIND demo source</p>
          <h1>${escapeHtml(title)}</h1>
          <div class="subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <div class="meta">
          Local-first source<br />
          Human-readable PDF<br />
          Text layer preserved
        </div>
      </section>
      <section class="callout">
        ${bodyHtml}
      </section>
      <div class="footer">Prepared for demo ingestion in MIND. Keep as a client-style PDF source, not app context.</div>
    </main>
  </body>
</html>`;
}

async function exportOne(doc: DocSpec, browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const markdown = await readFile(doc.input, 'utf8');
  const html = buildDocument(doc.title, doc.subtitle, markdownToHtml(markdown));
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: doc.output,
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' },
    });
    await writeFile(doc.output.replace(/\.pdf$/, '.html'), html, 'utf8');
    console.log(`wrote ${doc.output}`);
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });

  try {
    for (const doc of DOCS) {
      await exportOne(doc, browser);
    }
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
