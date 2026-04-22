# 04 Copy Compression Prompt

Use this after the mock-up mapping exists.

The goal is to compress copy so the mock-up sounds like the real product UI, not a presentation deck.

## Before You Prompt

- Which headings are too long?
- Which metadata labels can be shortened?
- Which helper copy is necessary for continuity, and which is presentation-only?
- Which CTA labels need to stay explicit?

## Copy-ready Prompt

```text
/narrative
Rewrite the mock-up UI copy so it matches the tone of the main app.

Rules:
- use product UI copy, not presentation copy
- keep headings short
- keep metadata compact
- keep CTA labels explicit
- remove onboarding explanation unless required for demo continuity

Output:
- top bar copy
- room header copy
- studio inspector copy
- next move copy
- checklist / helper copy
```

## Expected Output

- compressed top bar copy
- compressed room header copy
- compressed inspector copy
- compressed next move copy
- helper/checklist copy that stays out of the main working surface
