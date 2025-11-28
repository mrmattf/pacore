FROM node:18-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# Copy root package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY .npmrc ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy package files for workspaces
COPY packages/core/package.json ./packages/core/
COPY packages/adapters/package.json ./packages/adapters/
COPY packages/agent/package.json ./packages/agent/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/core ./packages/core
COPY packages/adapters ./packages/adapters
COPY packages/agent ./packages/agent

# Build packages
RUN pnpm run build

# Start the agent
CMD ["pnpm", "run", "start", "--filter=@pacore/agent"]
