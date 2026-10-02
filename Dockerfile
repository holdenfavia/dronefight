# dronefight: one container serves the built client and the room server on one port (ADR-0021).
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production SERVE_CLIENT=1 PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY shared ./shared
COPY server ./server
COPY --from=build /app/dist/client ./dist/client
EXPOSE 8080
CMD ["node_modules/.bin/tsx", "server/src/index.ts"]
