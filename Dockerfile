FROM node:24-bookworm-slim AS development
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

FROM development AS build
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package*.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
