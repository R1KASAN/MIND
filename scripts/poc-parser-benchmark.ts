/**
 * poc-parser-benchmark.ts
 *
 * DEV-ONLY. Do not import in src/.
 *
 * Goal: Compare MIND's current normalizeFileText/assessExtractedTextQuality
 * against `marked` (markdown→HTML→plain-text) for .txt and .md inputs.
 *
 * Original roadmap called for huashu-md-html, which does not exist on npm (404).
 * `marked` is the closest real-world equivalent for markdown parsing quality comparison.
 *
 * PDF comparison: PDF binary parsing (unpdf/pdfjs-dist) requires a server context
 * and is not benchmarkable in a bare Node script without the full Next.js runtime.
 * That gap is noted in the decision doc; PDF path remains unchanged in production.
 *
 * Run: npx tsx scripts/poc-parser-benchmark.ts
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

// ── Import MIND extraction helpers (server-only functions, safe here as dev script)
// We use a require-style dynamic path so tsc tsconfig.app.json does not pick this up.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { normalizeFileText, assessExtractedTextQuality } = require('../src/lib/room-extraction.server') as {
  normalizeFileText: (text: string) => string;
  assessExtractedTextQuality: (text: string) => {
    usable: boolean;
    normalizedText: string;
    reason?: string;
    metrics: {
      rawTextLength: number;
      normalizedTextLength: number;
      fragmentedRunCount: number;
      spaceDensity: number;
      normalWordRatio: number;
    };
  };
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');

// ── Keywords present in both fixtures ─────────────────────────────────────────
const KEYWORDS = [
  'backend', 'frontend', 'design', 'review', 'blocker',
  'timeline', 'client', 'complete', 'status', 'next',
  'ทีม', 'การอนุมัติ', 'ดำเนินการ',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function keywordCoverage(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  const found = keywords.filter((kw) => lower.includes(kw.toLowerCase()));
  return Math.round((found.length / keywords.length) * 100) / 100;
}

function garbageRatio(text: string): number {
  // Ratio of non-printable / non-Thai / non-Latin characters to total
  const nonPrint = (text.match(/[^\x20-\x7E\u0E00-\u0E7F\n\r\t]/g) ?? []).length;
  return text.length > 0 ? Math.round((nonPrint / text.length) * 1000) / 1000 : 0;
}

function structureScore(text: string): number {
  // Rough: reward presence of sections/headings/lists
  let score = 0;
  if (/^#+\s/m.test(text)) score += 1;       // markdown headings
  if (/^\d+\.\s/m.test(text)) score += 1;    // numbered lists
  if (/^[-*]\s/m.test(text)) score += 1;     // bullet lists
  if (/:\s*\n/.test(text)) score += 1;       // colon-separated sections
  if (/\*\*[^*]+\*\*/.test(text)) score += 1; // bold emphasis
  return Math.round((score / 5) * 100) / 100;
}

function thaiReadabilityNote(text: string): string {
  const thaiTokens = (text.match(/[\u0E00-\u0E7F]{3,}/g) ?? []);
  if (thaiTokens.length === 0) return 'no-thai';
  const avgLen = thaiTokens.reduce((sum, t) => sum + t.length, 0) / thaiTokens.length;
  if (avgLen >= 4) return 'good (avg token ≥4 chars)';
  if (avgLen >= 3) return 'acceptable (avg token ≥3 chars)';
  return 'poor (short tokens, possible fragmentation)';
}

interface BenchmarkResult {
  fixture: string;
  method: string;
  extractedTextLength: number;
  keywordCoverage: number;
  garbageRatio: number;
  structureScore: number;
  thaiReadabilityNote: string;
  mindQuality: { usable: boolean; reason?: string; normalWordRatio: number; fragmentedRunCount: number };
}

// ── Benchmark runners ─────────────────────────────────────────────────────────

function benchmarkMIND(label: string, rawText: string): BenchmarkResult {
  const normalized = normalizeFileText(rawText);
  const quality = assessExtractedTextQuality(rawText);
  return {
    fixture: label,
    method: 'MIND normalizeFileText',
    extractedTextLength: normalized.length,
    keywordCoverage: keywordCoverage(normalized, KEYWORDS),
    garbageRatio: garbageRatio(normalized),
    structureScore: structureScore(rawText), // raw for structure detection
    thaiReadabilityNote: thaiReadabilityNote(normalized),
    mindQuality: {
      usable: quality.usable,
      reason: quality.reason,
      normalWordRatio: Math.round(quality.metrics.normalWordRatio * 1000) / 1000,
      fragmentedRunCount: quality.metrics.fragmentedRunCount,
    },
  };
}

function benchmarkMarked(label: string, rawMarkdown: string): BenchmarkResult {
  const html = marked(rawMarkdown) as string;
  const plain = stripHtml(html);
  const quality = assessExtractedTextQuality(plain);
  return {
    fixture: label,
    method: 'marked → strip HTML',
    extractedTextLength: plain.length,
    keywordCoverage: keywordCoverage(plain, KEYWORDS),
    garbageRatio: garbageRatio(plain),
    structureScore: structureScore(rawMarkdown), // raw markdown for structure
    thaiReadabilityNote: thaiReadabilityNote(plain),
    mindQuality: {
      usable: quality.usable,
      reason: quality.reason,
      normalWordRatio: Math.round(quality.metrics.normalWordRatio * 1000) / 1000,
      fragmentedRunCount: quality.metrics.fragmentedRunCount,
    },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function printRow(r: BenchmarkResult) {
  console.log(`  fixture           : ${r.fixture}`);
  console.log(`  method            : ${r.method}`);
  console.log(`  extractedTextLen  : ${r.extractedTextLength}`);
  console.log(`  keywordCoverage   : ${r.keywordCoverage} (${Math.round(r.keywordCoverage * 100)}%)`);
  console.log(`  garbageRatio      : ${r.garbageRatio}`);
  console.log(`  structureScore    : ${r.structureScore}`);
  console.log(`  thaiReadability   : ${r.thaiReadabilityNote}`);
  console.log(`  mind.usable       : ${r.mindQuality.usable}${r.mindQuality.reason ? ` (${r.mindQuality.reason})` : ''}`);
  console.log(`  mind.normalWordR. : ${r.mindQuality.normalWordRatio}`);
  console.log(`  mind.fragmented   : ${r.mindQuality.fragmentedRunCount}`);
}

const results: BenchmarkResult[] = [];

// 1. TXT — MIND only (marked adds no value for plain text)
const txtRaw = readFileSync(join(FIXTURES_DIR, 'poc-sample.txt'), 'utf-8');
const txtMIND = benchmarkMIND('poc-sample.txt', txtRaw);
results.push(txtMIND);

// 2. MD — MIND normalizer vs marked
const mdRaw = readFileSync(join(FIXTURES_DIR, 'poc-sample.md'), 'utf-8');
const mdMIND = benchmarkMIND('poc-sample.md (MIND)', mdRaw);
const mdMarked = benchmarkMarked('poc-sample.md (marked)', mdRaw);
results.push(mdMIND, mdMarked);

// 3. Simulated scanned/garbage input (no fixture PDF — noted as scope boundary)
const garbageInput = 'P r o j e c t A l p h a\n\x00\x00\x00\n1 2 3 A B C\n';
const garbageMIND = benchmarkMIND('simulated-scanned-garbage', garbageInput);
results.push(garbageMIND);

console.log('\n[poc-parser-benchmark] Results\n' + '='.repeat(60));
for (const r of results) {
  console.log('');
  printRow(r);
}

console.log('\n[poc-parser-benchmark] PDF note:');
console.log('  PDF binary parsing (unpdf/pdfjs-dist) requires Next.js server context.');
console.log('  Not benchmarkable in bare Node script. See docs/product/huashu-poc-decision.md.');

console.log('\n[poc-parser-benchmark] Complete.\n');
