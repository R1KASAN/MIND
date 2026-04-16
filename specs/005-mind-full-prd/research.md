# Research: MIND Local-First AI MVP

> [ARCHIVAL] This research document describes a historical pre-Gemma phase of MIND and is not the current runtime source of truth. Use [README.md](/Users/ark1/Public/MIND/README.md), [docs/demo-runbook.md](/Users/ark1/Public/MIND/docs/demo-runbook.md), and `npm run gate:phase5` for the active local workflow.

## Decisions

### 1. AI Runtime: Local Ollama
- **Decision**: Use a local Ollama instance as the primary inference engine for the MVP.
- **Rationale**: 
    - **Privacy**: Brain dumps stay on the user's machine.
    - **Cost**: Zero inference cost for the developer and user (assuming they have the hardware).
    - **Offline Resilience**: Works without an internet connection once models are pulled.
- **Alternatives considered**: 
    - **OpenAI/Anthropic**: Rejected for MVP due to privacy concerns and recurring costs.
    - **On-device WebLLM**: Rejected due to higher browser resource consumption and less mature tooling compared to Ollama for local dev.

### 2. Model Selection: Qwen 2.5 3B (Default)
- **Decision**: Default to `qwen2.5:3b`.
- **Rationale**: 
    - **Performance**: High reasoning quality for its size, especially for structured JSON output.
    - **Footprint**: Easily fits in 8GB RAM, making it accessible to most knowledge workers.
- **Alternatives considered**: 
    - **Llama 3 8B**: Higher reasoning quality but significantly higher resource usage (16GB+ recommended).
    - **Mistral 7B**: Good but outclassed by Qwen 2.5 in small-model JSON adherence.

### 3. Fallback Hierarchy
- **Decision**: 
    1. Primary: `qwen2.5:3b`
    2. High-Performance: `qwen3:4b-instruct` (if hardware-capable)
    3. Low-Resource: `gemma3n:e2b`
- **Rationale**: Ensures the app works on a wide range of hardware while providing a path for higher quality for those who can afford the compute.

### 4. Integration Pattern: Next.js API Proxy
- **Decision**: The Next.js App Router will provide an API route (`/api/ai`) that proxies requests to the local Ollama endpoint (`http://localhost:11434/api/chat`).
- **Rationale**: 
    - **CORS handling**: Avoids cross-origin issues between the browser and local service.
    - **Schema Validation**: Allows Zod validation on the server/proxy layer before returning to the frontend.
    - **Retry Logic**: Centralizes retry and fallback management.

## Research Findings

### Ollama JSON Mode
- Validated that Ollama supports `format: "json"` in its chat API. This drastically reduces parse failures on smaller models like Qwen 3B.
- Models like Qwen 2.5 are highly resilient to system prompts enforcing schema.

### Browser Connectivity to Localhost
- Most browsers allow fetch to `localhost` from a secure context (`https` or `localhost` origin).
- A proxy route is safer for production-like local-first apps to handle potential environment variable differences.

### Hardware Assumptions
- **Minimum**: 8GB RAM, 4-core CPU (Gemma fallback).
- **Target**: 16GB RAM, M-series Mac or equivalent (Qwen 3B/4B).

## Unknowns Resolved
- **Fine-tuning**: Confirmed NOT required for MVP. Zero-shot prompting with structured output is sufficient for "dump-to-action" tasks.
- **Persistence**: Rejection rotation counts and mutated states will be stored in `AppSession` in IndexedDB to ensure refresh resilience.
