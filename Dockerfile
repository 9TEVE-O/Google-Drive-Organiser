# ============================================================================
# Stage 1: Build Client SPA & Server Bundle
# ============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package manifests and install deterministic dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy application source and configuration
COPY tsconfig.json vite.config.ts index.html server.ts mcp-server.ts metadata.json firebase-applet-config.json ./
COPY src ./src

# Verify TypeScript types and compile production assets (dist/ + dist/server.cjs)
RUN npm run lint && npm run build

# ============================================================================
# Stage 2: Minimal Production Runtime
# ============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install only production dependencies and clean npm cache
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled production bundle and runtime Firebase client config
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json

# Run as non-root user for container security
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["npm", "start"]
