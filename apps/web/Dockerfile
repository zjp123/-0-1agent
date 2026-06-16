# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --include=dev

FROM deps AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY apps/web apps/web
COPY packages packages
RUN npm run build:web

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S agent && adduser -S agent -G agent
COPY --from=build --chown=agent:agent /app/apps/web/.next/standalone ./
COPY --from=build --chown=agent:agent /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=agent:agent /app/apps/web/public ./apps/web/public
USER agent
EXPOSE 3001
CMD ["node", "apps/web/server.js"]

