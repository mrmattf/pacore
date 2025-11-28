FROM node:18-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# Copy root package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY .npmrc ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy package files for all workspaces
COPY packages/core/package.json ./packages/core/
COPY packages/adapters/package.json ./packages/adapters/
COPY packages/cloud/package.json ./packages/cloud/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/agent/package.json ./packages/agent/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code for all packages
COPY packages/core ./packages/core
COPY packages/adapters ./packages/adapters
COPY packages/cloud ./packages/cloud
COPY packages/sdk ./packages/sdk
COPY packages/agent ./packages/agent

# Build all packages (turbo will handle dependency order automatically)
# Force no cache to ensure fresh builds in Docker
RUN pnpm run build -- --force

# Expose port
EXPOSE 3000

# Set working directory to cloud package
WORKDIR /app/packages/cloud

# Start the application
CMD ["node", "dist/index.js"]
