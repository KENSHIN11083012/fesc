# Caja Link — imagen de varias etapas:
#   deps    → instala dependencias (incluidas las de desarrollo)
#   build   → compila TypeScript a JavaScript
#   test    → corre las pruebas del equipo contra el servicio en funcionamiento
#   runtime → imagen final, solo con el JavaScript compilado y dependencias de producción
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM deps AS test
COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
CMD ["sh", "-c", "mkdir -p test-results && node --import tsx --test --test-concurrency=1 --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=test-results/junit.xml \"tests/**/*.test.ts\""]

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 8083
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=10 \
  CMD node -e "fetch('http://localhost:8083/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/main.js"]
