FROM apify/actor-node:20

WORKDIR /usr/src/app

COPY --chown=myuser package*.json ./
RUN npm --quiet set progress=false && npm ci --include=dev --omit=optional

COPY --chown=myuser . ./
RUN npm run build
RUN npm prune --omit=dev --omit=optional --no-package-lock

CMD ["node", "dist/main.js"]
