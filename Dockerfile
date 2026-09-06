# Coal-Intel frontend container (Next.js standalone not enabled; runs the
# production server built in-image).  Build context is the repo root — the
# docker-compose frontend service's `build: .` previously pointed at a root
# Dockerfile that did not exist and failed outright.
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first so Docker layer-caches node_modules.
COPY package.json package-lock.json ./
RUN npm ci

# Build the production bundle.
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Run as the non-root "node" user shipped with the base image.
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/next.config.mjs ./next.config.mjs

EXPOSE 3000
USER node
CMD ["npx", "next", "start", "-p", "3000"]