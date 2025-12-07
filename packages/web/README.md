# PA Core Web UI

Minimalistic web interface for PA Core AI Orchestrator.

## Features (Phase 1)

- ✅ Login/Register authentication
- ✅ Provider configuration (Anthropic/OpenAI API keys)
- ✅ Chat interface with AI
- ✅ Category selector for semantic search
- ✅ Clean, minimal UI with NO conversation history

## Quick Start

### Development Mode

```bash
# From packages/web directory
pnpm dev
```

The UI will be available at [http://localhost:3001](http://localhost:3001)

### Build for Production

```bash
pnpm build
```

### Preview Production Build

```bash
pnpm preview
```

## Architecture

- **Port**: 3001
- **Backend API Proxy**: All `/v1` requests are proxied to `http://localhost:3000`
- **Authentication**: JWT tokens stored in browser localStorage via Zustand persist
- **Category Selection**: Helps backend semantic search filter results
- **Stateless**: No conversation history stored in UI - context comes from backend memory

## Tech Stack

- React 18 with TypeScript
- Vite (build tool)
- TailwindCSS (styling)
- Zustand (state management)
- React Router v6 (routing)
- Lucide React (icons)

## Pages

1. **Login** (`/login`) - Authentication
2. **Chat** (`/chat`) - Main chat interface with category selector
3. **Settings** (`/settings`) - Configure AI provider API keys

## How It Works

### Memory & Context
- UI does NOT store past conversations
- Backend remembers via vector embeddings (semantic search)
- User selects category to help backend filter relevant context

### Authentication Flow
1. User logs in at `/login`
2. JWT token stored in localStorage
3. Token sent with all API requests via `Authorization: Bearer` header
4. Protected routes redirect to login if no token

### Chat Flow
1. User types message
2. Frontend sends to `/v1/complete` with:
   - Current message
   - Selected category (for context filtering)
   - `saveToMemory: true` (backend stores for future context)
3. Backend:
   - Searches memory for relevant context
   - Sends to configured AI provider
   - Stores conversation in vector database
4. Frontend displays response

## Next Steps (Phase 2 - Future)

- Server-Sent Events (SSE) for streaming AI responses
- MCP server management UI
- Workflow visualization
- Advanced settings
