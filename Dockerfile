# ModelAxis platform — API gateway + console + static site in one container.
# Zero npm dependencies: only Node built-ins (http, sqlite, crypto).
FROM node:25-alpine

WORKDIR /app
COPY build.mjs ./
COPY partials ./partials
COPY assets ./assets
COPY src ./src
COPY server ./server

RUN node build.mjs

ENV MX_PORT=8787 \
    MX_DATA_DIR=/app/data
VOLUME /app/data
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8787/healthz || exit 1

CMD ["node", "server/index.mjs"]
