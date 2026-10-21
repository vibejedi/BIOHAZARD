FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --chown=node:node server/ ./server/
COPY --chown=node:node src/rules.js src/economy.js src/supplies.js src/bsp-navigation.js ./src/
COPY --chown=node:node server-data/dust2.json ./server-data/dust2.json
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 BIOHAZARD_MAP_DATA=/app/server-data/dust2.json
RUN mkdir -p /app/data && chown node:node /app/data
ENV ACCOUNTS_DB=/app/data/accounts.sqlite
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
