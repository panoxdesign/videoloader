# syntax=docker/dockerfile:1

ARG NODE_MAJOR=26

# --- base: Node, ffmpeg, yt-dlp ------------------------------------------------
FROM node:${NODE_MAJOR}-trixie-slim AS base
ARG TARGETARCH
ARG YTDLP_VERSION=2026.10.21

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Standalone-Binary, geprüft gegen SHA2-256SUMS desselben Releases.
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) f=yt-dlp_linux ;; \
      arm64) f=yt-dlp_linux_aarch64 ;; \
      *) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    base="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}"; \
    fetch() { node -e 'const [u, o] = process.argv.slice(1); fetch(u).then(async (r) => { if (!r.ok) throw new Error(`${r.status} ${u}`); require("fs").writeFileSync(o, Buffer.from(await r.arrayBuffer())); }).catch((e) => { console.error(e.message); process.exit(1); })' "$1" "$2"; }; \
    cd /tmp; \
    fetch "$base/$f" "$f"; \
    fetch "$base/SHA2-256SUMS" SHA2-256SUMS; \
    grep " $f\$" SHA2-256SUMS | sha256sum -c -; \
    install -m 755 "$f" /usr/local/bin/yt-dlp; \
    rm "$f" SHA2-256SUMS

RUN mkdir -p /etc/yt-dlp && printf -- '--js-runtimes node\n' > /etc/yt-dlp/config

ENV NEXT_TELEMETRY_DISABLED=1 \
    DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data

# --- dev: next dev mit Bind-Mount (compose.dev.yaml) -------------------------
FROM base AS dev
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json .npmrc ./
RUN npm ci
COPY --chown=node:node . .
EXPOSE 3000
CMD ["npx", "next", "dev", "--hostname", "0.0.0.0"]

# --- build: standalone-Output, nativ pro Architektur -------------------------
FROM dev AS build
RUN npm run build

# --- runtime: Produktions-Image ----------------------------------------------
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
