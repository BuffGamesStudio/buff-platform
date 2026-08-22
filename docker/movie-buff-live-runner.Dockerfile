FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY scripts/movie-buff-live-show-runner.mjs scripts/movie-buff-live-show-runner.mjs
COPY scripts/movie-buff-smoke-env.mjs scripts/movie-buff-smoke-env.mjs

ENV MOVIE_BUFF_LIVE_RUNNER_ENABLED=false
ENV MOVIE_BUFF_LIVE_SHOW_KEY=main
ENV MOVIE_BUFF_LIVE_RUNNER_POLL_MS=1000

CMD ["node", "scripts/movie-buff-live-show-runner.mjs"]
