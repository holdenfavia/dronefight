# dronefight: one container serves the built client and the room server on one port (ADR-0021).
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Public sign-in settings (ADR-0031), baked into the client at build time; set in fly.toml [build.args].
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
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
