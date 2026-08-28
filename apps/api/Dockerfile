FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/connectors/package.json packages/connectors/package.json
COPY packages/agents/package.json packages/agents/package.json
RUN npm ci --workspace=api --include-workspace-root

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
WORKDIR /app/packages/connectors
RUN npm run build
WORKDIR /app/packages/agents
RUN npm run build
WORKDIR /app/apps/api
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/connectors ./packages/connectors
COPY --from=build /app/packages/agents ./packages/agents
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/package.json ./package.json
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
