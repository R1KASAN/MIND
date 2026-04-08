# Quickstart: Core Action Loop

This guides developers through bootstrapping the MIND application with the Core Action Loop MVP.

## Prerequisites

- Node.js v20+
- A valid OpenAI (or other supported LLM) API key

## Setup Instructions

1. **Initialize Next.js application:**
   ```bash
   npx create-next-app@latest . --typescript --eslint --tailwind=false --app --src-dir --import-alias "@/*" --use-npm
   ```
   *(Note: Decline Tailwind to use vanilla CSS per constitution rules).*

2. **Install dependencies:**
   ```bash
   npm install idb-keyval ai
   ```

3. **Configure Environment Variables:**
   Create a `.env.local` file at the root:
   ```env
   OPENAI_API_KEY=your_api_key_here
   ```

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```

## Development Emphases

- **Mobile Viewport:** Always test using the browser's responsive design mode set to an iPhone size. Design everything without horizontal scrolling.
- **Routing:** Do not create separate pages/URLs unless the component architecture requires lazy loading limits. The MVP should flow as a seamless state machine on the main route to support "Momentum First".
