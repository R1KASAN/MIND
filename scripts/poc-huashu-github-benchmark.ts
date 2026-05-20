/**
 * poc-huashu-github-benchmark.ts
 *
 * DEV-ONLY. Do not import in src/.
 *
 * Goal:
 * Assess huashu-md-html (https://github.com/alchaincyf/huashu-md-html) as an
 * alternative text extraction tool for MIND's file ingestion pipeline.
 *
 * Findings from repo inspection:
 * - huashu is a PRESENTATION styling tool: md → beautiful HTML / md → DOCX
 * - Its `scripts/any_to_md.py` wraps Microsoft `markitdown` for extraction
 * - markitdown is the actual extraction library of interest
 * - pandoc is required for md → DOCX conversion
 *
 * This script:
 * 1. Detects Python, markitdown, pandoc availability WITHOUT installing anything
 * 2. If markitdown is available: runs any_to_md.py on .txt and .md fixtures
 *    (downloads script to temp, no repo clone committed)
 * 3. Passes output through MIND's normalizeFileText/assessExtractedTextQuality
 * 4. Compares vs MIND-direct path + marked baseline (from previous POC)
 * 5. Reports dependencyReadiness and runtimeRisk
 *
 * Run: npx tsx scripts/poc-huashu-github-benchmark.ts
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';
import { marked } from 'marked';

// ── MIND extraction helpers (dev-only import, not in tsconfig.app.json) ───────
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
const TMP_DIR = join(__dirname, '..', '.tmp-huashu-poc');

// ── Dependency detection ──────────────────────────────────────────────────────

interface DependencyStatus {
  python3: boolean;
  pythonVersion: string | null;
  markitdown: boolean;
  pandoc: boolean;
  canRunAnyToMd: boolean;
}

function detectDependencies(): DependencyStatus {
  let python3 = false;
  let pythonVersion: string | null = null;
  let markitdown = false;
  let pandoc = false;

  try {
    const r = spawnSync('python3', ['--version'], { encoding: 'utf-8', timeout: 5000 });
    if (r.status === 0) {
      python3 = true;
      pythonVersion = (r.stdout || r.stderr || '').trim();
    }
  } catch { /* not found */ }

  if (python3) {
    try {
      const r = spawnSync('python3', ['-c', 'import markitdown; print("ok")'], {
        encoding: 'utf-8', timeout: 5000,
      });
      markitdown = r.status === 0 && (r.stdout || '').includes('ok');
    } catch { /* not installed */ }
  }

  try {
    const r = spawnSync('pandoc', ['--version'], { encoding: 'utf-8', timeout: 5000 });
    pandoc = r.status === 0;
  } catch { /* not installed */ }

  return {
    python3,
    pythonVersion,
    markitdown,
    pandoc,
    canRunAnyToMd: python3 && markitdown,
  };
}

// ── Metric helpers (same as poc-parser-benchmark.ts) ─────────────────────────

const KEYWORDS = [
  'backend', 'frontend', 'design', 'review', 'blocker',
  'timeline', 'client', 'complete', 'status', 'next',
  'ทีม', 'การอนุมัติ', 'ดำเนินการ',
];

function keywordCoverage(text: string): number {
  const lower = text.toLowerCase();
  const found = KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()));
  return Math.round((found.length / KEYWORDS.length) * 100) / 100;
}

function garbageRatio(text: string): number {
  const nonPrint = (text.match(/[^\x20-\x7E\u0E00-\u0E7F\n\r\t]/g) ?? []).length;
  return text.length > 0 ? Math.round((nonPrint / text.length) * 1000) / 1000 : 0;
}

function structureScore(text: string): number {
  let score = 0;
  if (/^#+\s/m.test(text)) score += 1;
  if (/^\d+\.\s/m.test(text)) score += 1;
  if (/^[-*]\s/m.test(text)) score += 1;
  if (/:\s*\n/.test(text)) score += 1;
  if (/\*\*[^*]+\*\*/.test(text)) score += 1;
  return Math.round((score / 5) * 100) / 100;
}

function thaiReadabilityNote(text: string): string {
  const tokens = (text.match(/[\u0E00-\u0E7F]{3,}/g) ?? []);
  if (tokens.length === 0) return 'no-thai';
  const avg = tokens.reduce((s, t) => s + t.length, 0) / tokens.length;
  if (avg >= 4) return 'good (≥4 avg)';
  if (avg >= 3) return 'acceptable (≥3 avg)';
  return 'poor (<3 avg)';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

interface MetricRow {
  fixture: string;
  method: string;
  textLen: number;
  keywords: number;
  garbage: number;
  structure: number;
  thai: string;
  usable: boolean;
  reason?: string;
  normalWordRatio: number;
}

function buildMetrics(fixture: string, method: string, raw: string, structureSource?: string): MetricRow {
  const norm = normalizeFileText(raw);
  const q = assessExtractedTextQuality(raw);
  return {
    fixture,
    method,
    textLen: norm.length,
    keywords: keywordCoverage(norm),
    garbage: garbageRatio(norm),
    structure: structureScore(structureSource ?? raw),
    thai: thaiReadabilityNote(norm),
    usable: q.usable,
    reason: q.reason,
    normalWordRatio: Math.round(q.metrics.normalWordRatio * 1000) / 1000,
  };
}

function printRow(r: MetricRow) {
  console.log(`  fixture   : ${r.fixture}`);
  console.log(`  method    : ${r.method}`);
  console.log(`  textLen   : ${r.textLen}`);
  console.log(`  keywords  : ${r.keywords} (${Math.round(r.keywords * 100)}%)`);
  console.log(`  garbage   : ${r.garbage}`);
  console.log(`  structure : ${r.structure}`);
  console.log(`  thai      : ${r.thai}`);
  console.log(`  usable    : ${r.usable}${r.reason ? ` (${r.reason})` : ''}`);
  console.log(`  wordRatio : ${r.normalWordRatio}`);
}

// ── Fetch any_to_md.py to temp (no clone) ────────────────────────────────────

function fetchAnyToMd(): string {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
  const dest = join(TMP_DIR, 'any_to_md.py');
  if (!existsSync(dest)) {
    console.log('  Fetching any_to_md.py from GitHub (one-time, temp only)...');
    try {
      execSync(
        `curl -fsSL https://raw.githubusercontent.com/alchaincyf/huashu-md-html/main/scripts/any_to_md.py -o "${dest}"`,
        { timeout: 15000 },
      );
    } catch (e) {
      throw new Error(`Failed to fetch any_to_md.py: ${String(e)}`);
    }
  }
  return dest;
}

function runAnyToMd(scriptPath: string, fixturePath: string): string {
  const result = spawnSync(
    'python3',
    [scriptPath, fixturePath, '--output', '-'],
    { encoding: 'utf-8', timeout: 30000 },
  );
  if (result.status !== 0) {
    throw new Error(`any_to_md.py failed: ${result.stderr}`);
  }
  return result.stdout || '';
}

// ── Main ──────────────────────────────────────────────────────────────────────

const rows: MetricRow[] = [];

console.log('\n[poc-huashu-github-benchmark]\n' + '='.repeat(60));

// 1. Dependency check
console.log('\n── Dependency Readiness ──');
const deps = detectDependencies();
console.log(`  python3      : ${deps.python3 ? `✅ ${deps.pythonVersion}` : '❌ not found'}`);
console.log(`  markitdown   : ${deps.markitdown ? '✅ installed' : '❌ not installed (pip install markitdown[all])'}`);
console.log(`  pandoc       : ${deps.pandoc ? '✅ installed' : '❌ not found (brew install pandoc)'}`);
console.log(`  canRunAnyToMd: ${deps.canRunAnyToMd ? '✅ yes' : '❌ no'}`);

const dependencyReadiness = deps.canRunAnyToMd ? 'READY' : 'BLOCKED';
const runtimeRisk = deps.canRunAnyToMd ? 'low' : 'high (missing markitdown)';

// 2. MIND baseline
console.log('\n── MIND Baseline (always runs) ──');
const txtRaw = readFileSync(join(FIXTURES_DIR, 'poc-sample.txt'), 'utf-8');
const mdRaw = readFileSync(join(FIXTURES_DIR, 'poc-sample.md'), 'utf-8');

const r_txt_mind = buildMetrics('poc-sample.txt', 'MIND normalizeFileText', txtRaw);
const r_md_mind = buildMetrics('poc-sample.md', 'MIND normalizeFileText', mdRaw);
const r_md_marked = buildMetrics('poc-sample.md', 'marked→strip (baseline)', stripHtml(marked(mdRaw) as string), mdRaw);
rows.push(r_txt_mind, r_md_mind, r_md_marked);

console.log(''); printRow(r_txt_mind);
console.log(''); printRow(r_md_mind);
console.log(''); printRow(r_md_marked);

// 3. huashu/markitdown path (only if deps available)
if (deps.canRunAnyToMd) {
  console.log('\n── huashu any_to_md.py (via markitdown) ──');
  try {
    const scriptPath = fetchAnyToMd();

    const huashu_txt = runAnyToMd(scriptPath, join(FIXTURES_DIR, 'poc-sample.txt'));
    const r_txt_huashu = buildMetrics('poc-sample.txt', 'huashu any_to_md.py', huashu_txt);
    rows.push(r_txt_huashu);
    console.log(''); printRow(r_txt_huashu);

    const huashu_md = runAnyToMd(scriptPath, join(FIXTURES_DIR, 'poc-sample.md'));
    const r_md_huashu = buildMetrics('poc-sample.md', 'huashu any_to_md.py', huashu_md, mdRaw);
    rows.push(r_md_huashu);
    console.log(''); printRow(r_md_huashu);
  } catch (e) {
    console.log(`  ❌ huashu run failed: ${String(e)}`);
  }
} else {
  console.log('\n── huashu any_to_md.py: SKIPPED (markitdown not installed) ──');
  console.log('  To enable: pip install markitdown[all]');
  console.log('  Then re-run: npm run poc:huashu-github');
}

// 4. Summary
console.log('\n── Summary ──');
console.log(`  dependencyReadiness : ${dependencyReadiness}`);
console.log(`  runtimeRisk         : ${runtimeRisk}`);
console.log(`  huashu nature       : md→HTML/DOCX styling tool. Extraction via markitdown.`);
console.log(`  pandoc needed for   : md_to_docx.py only (not relevant to MIND ingestion)`);

// 5. Go/no-go
console.log('\n── Go / No-Go ──');
if (deps.canRunAnyToMd) {
  console.log('  markitdown is available. Review metric rows above for comparison.');
  console.log('  If markitdown shows no improvement over MIND baseline: NO-GO.');
  console.log('  If markitdown improves scanned-PDF or structured-doc quality: DEFER to Phase 4 evaluation.');
} else {
  console.log('  DEFER — markitdown not installed on this machine.');
  console.log('  huashu itself is a presentation tool (md→HTML), not an ingestion parser.');
  console.log('  The extraction kernel (markitdown) requires a separate pip install decision.');
  console.log('  Recommendation: NO-GO for Phase 3.8. Revisit as Phase 4 entry if OCR becomes blocker.');
}

console.log('\n[poc-huashu-github-benchmark] Complete.\n');
