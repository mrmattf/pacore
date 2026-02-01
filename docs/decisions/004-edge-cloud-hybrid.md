# ADR-004: Edge + Cloud Hybrid Architecture

## Status
Proposed

## Context

Users want a personal assistant experience similar to Moltbot (local agent with full system access), but with enterprise-grade security and multi-user support. Pure cloud can't access:
- Local messaging apps (WhatsApp, iMessage)
- Desktop applications
- Local filesystem
- Browser sessions

Pure edge (like Moltbot) has issues:
- Credentials stored in plaintext files
- No multi-user support
- No centralized workflow management
- Security vulnerabilities (exposed instances, supply chain attacks)

## Decision

Implement a hybrid Edge + Cloud architecture:

```
┌─────────────────────────────────────────────────┐
│              USER'S DEVICE (Edge)                │
│  ┌─────────────────────────────────────────┐    │
│  │           PA Core Edge Agent             │    │
│  │  - WhatsApp/iMessage/Telegram gateways  │    │
│  │  - Browser automation                    │    │
│  │  - Local file access                     │    │
│  │  - Context awareness                     │    │
│  └──────────────────┬──────────────────────┘    │
└─────────────────────┼───────────────────────────┘
                      │ WebSocket + JWT
                      ▼
┌─────────────────────────────────────────────────┐
│              PA CORE CLOUD                       │
│  - LLM orchestration                            │
│  - MCP server execution                         │
│  - Workflow engine                              │
│  - Encrypted credential vault                   │
│  - Multi-user, audit logging                    │
└─────────────────────────────────────────────────┘
```

## Credential Storage Strategy

| Credential Type | Location | Reason |
|----------------|----------|--------|
| WhatsApp session | Edge (OS Keychain) | Device-bound |
| iMessage auth | Edge (macOS Keychain) | Apple ID required |
| Gmail OAuth | Cloud (encrypted) | Refreshable from cloud |
| API keys | Cloud (encrypted) | Shared, secure |
| Edge-to-Cloud auth | Both | JWT on edge, validated by cloud |

## Consequences

### Positive
- Best of both worlds: local access + cloud security
- Credentials protected in encrypted cloud vault
- Multi-device support (same workflows everywhere)
- Enterprise features (audit, multi-user, permissions)
- Graceful degradation (cloud works without edge)

### Negative
- More complex architecture
- Need to build and maintain edge agent
- Edge requires device installation
- Network dependency for cloud features

### Implementation Phases
1. Cloud-first (current) - Web UI, all cloud execution
2. Edge MVP - Desktop app, basic channel support
3. Full channels - WhatsApp, iMessage, Slack
4. Local tools - Browser, filesystem, clipboard

## Related
- Moltbot analysis: See conversation history
- Edge agent design: TBD