FROM node:18-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# Copy root package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY .npmrc ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy package.json files for all workspaces (cache layer)
COPY packages/core/package.json ./packages/core/
COPY packages/adapters/package.json ./packages/adapters/
COPY packages/cloud/package.json ./packages/cloud/
COPY packages/web/package.json ./packages/web/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/agent/package.json ./packages/agent/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code for all packages
COPY packages/core ./packages/core
COPY packages/adapters ./packages/adapters
COPY packages/cloud ./packages/cloud
COPY packages/web ./packages/web
COPY packages/sdk ./packages/sdk
COPY packages/agent ./packages/agent

# Build-time env vars for Vite (baked into the frontend bundle at build time)
ARG VITE_CF_TURNSTILE_SITE_KEY
ENV VITE_CF_TURNSTILE_SITE_KEY=$VITE_CF_TURNSTILE_SITE_KEY

# Build all packages (turbo handles dependency order; --force bypasses turbo cache)
RUN ./node_modules/.bin/turbo run build --force

# Copy web frontend dist into cloud's public folder for Express to serve
RUN cp -r packages/web/dist packages/cloud/public

# Expose port
EXPOSE 3000

# Set working directory to cloud package
WORKDIR /app/packages/cloud

# Start the application
CMD ["node", "dist/index.js"]
