# PR Note — File Room MVP

This change adds a File Room MVP to MIND vNext so one task can ingest mixed context from text, PDF, screenshots, and pasted table-like text without turning the product into a file manager.

What changed:
- Added room-aware task context with `sourceFiles[]` and `extractedText`
- Added local extraction route for PDF, image OCR, text, and CSV-like inputs
- Wired the dump composer to submit text and files as one room-scoped payload
- Updated the spec to define `Room = TaskContext + sourceFiles + extractedText`
- Kept the core UX intact: one input surface, one visible action, honest recovery, no mode selector

Why it matters:
- `client_response` can now use PDF brief + screenshot feedback + chat text in one pass
- `client_resume` can now use scope docs + old notes to rebuild context faster
- Resume still comes from task state and checkpoint, not from chat history alone

Guardrails:
- No room picker before submit
- No file browser, folder tree, or shared workspace
- Room stays an internal task-scoped context container
