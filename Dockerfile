FROM node:24.15.0-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY scripts ./scripts
RUN npm ci
COPY . .
RUN npm run build

FROM node:24.15.0-alpine AS runner
WORKDIR /app
COPY package*.json ./
COPY scripts ./scripts
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
RUN mkdir -p video-storage

ARG STAGE
ENV STAGE=${STAGE}

CMD ["sh", "-c", "node ./node_modules/typeorm/cli.js migration:run -d dist/ormconfig.js && node dist/main"]
