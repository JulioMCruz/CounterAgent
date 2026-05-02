FROM public.ecr.aws/docker/library/node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --ignore-scripts

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM public.ecr.aws/docker/library/node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 8890
CMD ["node", "dist/server.js"]
