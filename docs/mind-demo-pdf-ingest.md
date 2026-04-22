# MIND Demo PDF Ingest Guide

This guide sits under the MIND ingest stability + optional RAG architecture. It only refines the PDF branch: `pdf.js text layer -> OCR fallback -> quality gate -> ready/failed source file`.

## Demo PDF checklist

- Use text-native PDFs, not screenshots or scanned pages.
- Prefer export flows from Google Docs, Word, or Notion that preserve selectable text.
- Avoid browser print-to-PDF for Thai-heavy demo files unless the local extract check passes.
- Use common Unicode-safe fonts such as Noto Sans Thai, Noto Sans, Arial, or system Thai fonts.
- Avoid decorative fonts, letter spacing, outlines, shadows, clipped text, SVG text, and text converted to paths.
- Keep the page simple: one column, normal paragraph flow, no rotated text, no transparent overlays, no large background effects behind text.
- Structure demo content as title, sender/date, subject, body, decisions, blockers, and next move.
- Do not manually insert spaces between Thai characters for visual styling.
- Before a live walkthrough, run the file through `/api/file-room/extract` and require `status: "ready"` plus non-empty `extractedText`.
- If a demo PDF fails with `fragmented_word_runs`, regenerate the PDF or use a companion text source. Do not keep retrying the same PDF.
- For critical demos, attach a `.md` or `.txt` file with the same content as the PDF. Treat the text companion as the trusted ingest source and the PDF as visible evidence.

## Quality gate behavior

- A `200` response from `/api/file-room/extract` means the route completed; it does not guarantee the PDF became trusted context.
- Clean text-layer output becomes a ready source file without OCR.
- Garbled text-layer output falls back to OCR.
- Garbled OCR output becomes a failed source file with `failureReason: "pdf_text_garbled_after_ocr"`.
- Failed files stay visible as failed source cards with retry and manual-summary guidance, while the room continues with any other usable context.

## Backend roadmap

- v1 keeps `extractPdfTextLayer`, Tesseract OCR fallback, and `assessExtractedTextQuality`.
- v1 tracks OCR metrics such as raw length, normalized length, fragmented runs, spacing density, word integrity, pages processed, engine, and duration.
- v1.5 should route OCR through an internal adapter so OCRmyPDF or PaddleOCR can be evaluated without changing the room/source UI.
- v2 may add cloud OCR only as opt-in/demo fallback; it must still pass through the same quality gate before becoming room context.

## Supervisor-facing explanation

- We did not install OCR skills from `skills.sh` as the main solution because the issue is document extraction quality and backend reliability inside the product pipeline.
- MIND intentionally rejects OCR output that looks broken because bad OCR would create misleading task context.
- Short term, we use extraction-friendly demo PDFs and companion `.md`/`.txt` files so demos prove the task workflow.
- Medium term, stronger OCR engines such as OCRmyPDF or PaddleOCR can plug into MIND behind our own adapter while the quality gate remains in control.

## Metrics to watch

- `ocr_failure_rate`
- `ocr_garbled_rate`
- `demo_pdf_ready_rate`
- `ocr_retry_success_rate`
