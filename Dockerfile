# syntax=docker/dockerfile:1

# --- frontend ---
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json pwa-assets.config.ts ./
COPY public ./public
RUN npm ci

COPY . .
RUN npm run build-only

# --- runtime: multi-site proxy (serve.py) ---
FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY serve.py fa_proxy.py furbooru_cf.py ./
COPY --from=build /app/dist ./dist

ENV M_E621_ROOT=/app/dist \
    M_E621_DIR=/app \
    M_E621_CONFIG=/data/config \
    M_E621_HOST=0.0.0.0 \
    M_E621_PORT=18621 \
    M_E621_DOMAIN=localhost

EXPOSE 18621
VOLUME ["/data/config"]

CMD ["python3", "serve.py"]
