FROM node:22-alpine

WORKDIR /app

RUN addgroup -S -g 10001 moviebuff \
  && adduser -S -D -H -u 10001 -G moviebuff moviebuff

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY scripts/movie-buff-live-show-runner.mjs scripts/movie-buff-live-show-runner.mjs
COPY scripts/movie-buff-live-provider-bridge.mjs scripts/movie-buff-live-provider-bridge.mjs
COPY scripts/movie-buff-smoke-env.mjs scripts/movie-buff-smoke-env.mjs
RUN chown -R moviebuff:moviebuff /app

ENV MOVIE_BUFF_LIVE_RUNNER_ENABLED=false
ENV MOVIE_BUFF_LIVE_SHOW_KEY=main
ENV MOVIE_BUFF_LIVE_RUNNER_POLL_MS=1000
ENV NODE_ENV=production

USER 10001:10001

STOPSIGNAL SIGTERM

# This only verifies that the runner process exists in the container. Database
# heartbeat and lease health must be checked by an external monitor.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "const fs=require('node:fs');const healthy=fs.readdirSync('/proc').some((entry)=>{if(!/^\\d+$/.test(entry)||entry===String(process.pid))return false;try{const cmdline=fs.readFileSync('/proc/'+entry+'/cmdline','utf8').replace(/\\0/g,' ');return cmdline.includes('scripts/movie-buff-live-show-runner.mjs')}catch{return false}});process.exit(healthy?0:1)"]

CMD ["node", "scripts/movie-buff-live-show-runner.mjs"]
