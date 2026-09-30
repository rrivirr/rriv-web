# web — production image: build the SPA, serve it with nginx.
# Build context: the web repo root. Build: docker build -f deployment/Dockerfile .
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY deployment/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY deployment/nginx/40-rriv-config.sh /docker-entrypoint.d/40-rriv-config.sh
RUN chmod +x /docker-entrypoint.d/40-rriv-config.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
