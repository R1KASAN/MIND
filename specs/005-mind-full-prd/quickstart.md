# Quickstart: MIND (Local-First MVP)

## Prerequisites

1. **Ollama**: Install from [ollama.com](https://ollama.com).
2. **Models**: Pull the required weights.
    - `ollama pull qwen2.5:3b` (Default)
    - `ollama pull qwen3:4b-instruct` (High Quality)
    - `ollama pull gemma3n:e2b` (Low Resource)

## Getting Started

1. **Clone & Install**:
    - `git clone [REPO_URL]`
    - `npm install`

2. **Environment Variables**:
    - Create a `.env.local` file:
    ```bash
    OLLAMA_URL=http://localhost:11434
    DEFAULT_MODEL=qwen2.5:3b
    ```

3. **Run Development Server**:
    - `npm run dev`

4. **Verify Loop**:
    - Open `http://localhost:3000`.
    - Submit a messy brain dump.
    - Check the `SYNTHESIZING` state and confirm the One-Action view appears.

## Troubleshooting

- **Ollama Timeout**: If the synthesis takes more than 8 seconds, the app will transition to `MANUAL_FALLBACK`. Check the machine's CPU/GPU load.
- **JSON Parsing**: If the model fails to return valid JSON, the proxy will retry once. Update `DEFAULT_MODEL` to a larger model if failures persist.
- **Offline Mode**: If Ollama is not running, the system immediately shows "AI is offline" with manual input.
