# ADR-004: Docker Deployment over Nixpacks

## Status
Accepted

## Context

Railway supports multiple deployment methods:
1. **Nixpacks**: Auto-detect and build (default)
2. **Docker**: Custom Dockerfile
3. **Buildpacks**: Heroku-style buildpacks

Initial attempts to use Nixpacks with pnpm failed because:
- `nixpacks.toml` configuration was inconsistent
- pnpm workspace protocol caused issues
- Build commands weren't reliably executed

## Decision

Use a custom Dockerfile with npm (not pnpm):

```dockerfile
FROM node:18-slim
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3002
CMD ["node", "dist/index.js"]
```

Key decisions:
1. **node:18-slim**: Minimal image size, sufficient for production
2. **npm over pnpm**: Universal compatibility, no extra setup
3. **Explicit build step**: TypeScript compilation in container
4. **PORT via env**: Railway sets PORT, app reads from env

## Consequences

### Positive
- Predictable builds (same result locally and in CI)
- Full control over build process
- Works on any Docker-compatible platform
- Easy to debug build issues locally

### Negative
- Slower builds than optimized Nixpacks (no caching hints)
- Must maintain Dockerfile manually
- Larger image than necessary (could optimize)

### Future Optimizations
```dockerfile
# Multi-stage build for smaller production image
FROM node:18-slim AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:18-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
CMD ["node", "dist/index.js"]
```
