FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 8788
CMD ["node", "dist/server.js"]
