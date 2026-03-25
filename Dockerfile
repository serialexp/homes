# Build stage
FROM node:20-slim AS build

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
FROM node:20-slim AS production

WORKDIR /app

# Copy built application from build stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY --from=build /app/server.ts ./
COPY --from=build /app/app ./app
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma

# Install only production dependencies
RUN npm install -g pnpm && pnpm install --prod

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["node_modules/.bin/tsx", "server.ts"]