# huashu-md-html POC — Decision Document (Corrected)

**Date:** 2026-05-17 (corrected)
**Phase:** 3.8 — Alternative Parser POC
**Status:** COMPLETE — DEFER / CONDITIONAL NO-GO

---

## Correction from Previous Version

The previous version of this document incorrectly treated `huashu-md-html` as an npm
package and pivoted to `marked` when the npm install failed (404).

**Correct facts:**
- `huashu-md-html` is a **GitHub repository** (https://github.com/alchaincyf/huashu-md-html)
- It is a **presentation styling skill**: `md → beautiful HTML` and `md → DOCX`
- It is **not an ingestion/extraction parser**
- Its `scripts/any_to_md.py` wraps **Microsoft `markitdown`** for any-file→markdown conversion
- `markitdown` is the actual extraction library of interest

The `marked` result from the previous POC remains valid as a **secondary baseline only**
(markdown→plain-text comparison), but it does not represent huashu's intended capability.

---

## What huashu-md-html Actually Is

| Script | Purpose | Relevance to MIND ingestion |
|---|---|---|
| `scripts/any_to_md.py` | File/URL → markdown (via `markitdown`) | Potentially relevant for PDF/DOCX extraction |
| `scripts/md_to_html.py` | md → styled HTML (Kenya Hara / Pentagram themes) | **Not relevant** — presentation output |
| `scripts/md_to_docx.py` | md → DOCX (via pandoc) | **Not relevant** — presentation output |
| `scripts/html_to_md.py` | HTML/URL → markdown (via trafilatura) | **Not relevant** — web scraping |

**MIND's ingestion problem is about extracting readable text from user files.**
huashu as a whole is not designed for this. Only `markitdown` via `any_to_md.py` is relevant.

---

## Dependency Readiness (2026-05-17)

| Dependency | Status | Install |
|---|---|---|
| python3 | ✅ Python 3.9.6 | present |
| markitdown | ❌ not installed | `pip install markitdown[all]` |
| pandoc | ❌ not found | `brew install pandoc` (not needed for MIND) |
| canRunAnyToMd | ❌ BLOCKED | requires markitdown |

`dependencyReadiness: BLOCKED`
`runtimeRisk: high (missing markitdown)`

---

## Benchmark Results

Script: `scripts/poc-huashu-github-benchmark.ts`
Run: `npm run poc:huashu-github`

### MIND Baseline (always runs)

| Fixture | Method | TextLen | Keywords | Garbage | Structure | Thai | Usable | WordRatio |
|---|---|---|---|---|---|---|---|---|
| poc-sample.txt | MIND normalizeFileText | 519 | 100% | 0.002 | 0.60 | good | ✅ | 0.922 |
| poc-sample.md | MIND normalizeFileText | 448 | 100% | 0.002 | 0.80 | good | ✅ | 0.885 |
| poc-sample.md | marked→strip (baseline) | 405 | 100% | 0.002 | 0.80 | good | ✅ | 0.885 |

### huashu any_to_md.py (markitdown)

**SKIPPED** — `markitdown` not installed on this machine.

The benchmark script automatically runs this section if `markitdown` is installed.
To enable: `pip install markitdown[all]` then `npm run poc:huashu-github`.

---

## Analysis

### huashu as a presentation tool
huashu is designed to produce polished HTML/DOCX from markdown. Its output is a styled
rendering artifact, not a text extraction product. Using it as an ingestion parser would
be a category error.

### markitdown (the relevant extraction kernel)
Microsoft `markitdown` supports PDF, DOCX, PPTX, XLSX, images (with LLM description),
audio (with transcription), and more. It is a real extraction library.

**However**, for MIND's current use case:
- Plain text and markdown: MIND's `normalizeFileText` already achieves 100% keyword coverage
  and identical quality metrics vs. any markdown parser
- PDF scanned/garbage: MIND's `assessExtractedTextQuality` correctly rejects bad input via
  `embedded_nul` and `fragmented_word_runs` gates
- The only potential markitdown advantage would be for DOCX/PPTX/XLSX formats — which are
  not in scope for the current prototype demo path

### marked baseline (secondary)
`marked` (markdown→HTML→strip) produces no measurable improvement over MIND normalizer
for `.md` inputs. Both achieve 100% keyword coverage and identical `normalWordRatio`.
This confirms the previous POC conclusion was valid for that specific comparison.

---

## Risks

| Risk | Assessment |
|---|---|
| markitdown not installed | Confirmed blocker for huashu integration |
| pandoc not installed | Not needed for MIND ingestion; only needed for md→DOCX |
| huashu category mismatch | huashu is a presentation tool, not an extraction parser |
| markitdown Python dep | Would add a Python runtime requirement to a Node.js project |
| DOCX/PPTX support gap | markitdown could fill this, but these formats are out of prototype scope |

---

## Go / No-Go Decision

### **DEFER — do not add markitdown or huashu to MIND's ingestion pipeline.**

**Rationale:**
1. huashu is a presentation tool — orthogonal to MIND's ingestion problem.
2. markitdown (the extraction kernel) is not installed and adds a Python runtime dependency
   to a Node.js project — significant cross-runtime maintenance risk.
3. For current prototype scope (txt, md, PDF), MIND's existing extraction path achieves
   100% quality on fixture tests and correctly rejects garbage inputs.
4. DOCX/PPTX/XLSX support (markitdown's main value-add) is explicitly out of prototype scope.
5. pandoc is not installed and not needed for any current MIND use case.

### Conditional Re-evaluation Criteria
Revisit `markitdown` (not huashu) as a Phase 4 option **only if**:
- Real client documents in a live demo Room fail extraction with the current pipeline
- The failed format is DOCX, PPTX, or XLSX (not just PDF — PDF path already has Tesseract fallback)
- A Python runtime can be isolated from the Node.js prod environment safely

---

## Recommendation for Phase 4

> Phase 4 entry criteria remains unchanged:
> Reproducible OCR failure on a real client document that the current fallback chain cannot recover from.
>
> If/when that occurs, evaluate `markitdown` directly (not via huashu) as a Python subprocess
> for DOCX/PPTX formats. Do NOT use huashu's presentation pipeline for ingestion.

---

## Non-Clean Validation Notes

- `smoke:fallback-e2e` — terminated in Phase 3.6 validation due to port contention (EADDRINUSE 3205).
  Known tooling gap. Not a product blocker. No logic changes in Phases 3.6 or 3.8.
- huashu `any_to_md.py` benchmark skipped due to missing `markitdown`. Script will auto-run
  comparison if `pip install markitdown[all]` is executed before next `npm run poc:huashu-github`.
