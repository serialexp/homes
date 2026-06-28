# Build stage
FROM node:24-slim AS build

WORKDIR /app

# Copy package files and install dependencies
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN pnpm build

# Production stage
FROM node:24-slim AS production

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built application from build stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY --from=build /app/server.ts ./
COPY --from=build /app/app ./app
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/data ./data

# Install only production dependencies and regenerate Prisma client for this OS
ENV CI=true
RUN npm install -g pnpm && pnpm install --prod && npx prisma generate

# Bake in version info (passed from CI; see .github/workflows/docker.yml)
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ENV GIT_SHA=$GIT_SHA
ENV BUILD_TIME=$BUILD_TIME

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port the app runs on
EXPOSE 3000

# Run migrations then start the application
CMD ["sh", "-c", "npx prisma migrate deploy && node_modules/.bin/tsx server.ts"]