# ADR-001: Standalone Package Structure

## Status
Accepted

## Context

The shopify-backorder service is part of the pacore monorepo but needs to be deployed independently to Railway. Initially, the package used pnpm workspace dependencies (`workspace:*` protocol) which caused deployment failures because:

1. Railway's build system uses npm, not pnpm
2. npm doesn't understand the `workspace:*` protocol
3. The package had a dependency on `@pacore/core` which wasn't actually being used

## Decision

Make the shopify-backorder package completely standalone:

1. Remove all `workspace:*` dependencies
2. Remove unused `@pacore/core` dependency
3. Create a standalone `tsconfig.json` (no extends, no project references)
4. Use `package.json` without workspace-specific configurations
5. Create a Dockerfile that uses npm instead of pnpm

## Consequences

### Positive
- Package can be deployed independently to any platform
- No dependency on monorepo build system for deployment
- Simpler deployment process (standard Docker build)
- Can be extracted to separate repository if needed

### Negative
- Cannot share code with other pacore packages without explicit npm publishing
- Duplicate dependencies if other packages need the same libraries
- Must maintain separate TypeScript configuration

### Mitigation
- When Phase 3/4 integration happens, shared code will be accessed via MCP tools or published packages
- For now, the isolation is acceptable for MVP scope
