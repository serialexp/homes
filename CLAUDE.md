# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Japan Property Explorer - a web application that scrapes Japanese real estate listings from Suumo (suumo.jp), stores them in MySQL, and presents them through a Remix frontend. Handles both purchase properties (houses, mansions, land) and rental properties (buildings with units).

## Commands

- **Dev server:** `pnpm dev` (Remix + Vite dev server)
- **Build:** `pnpm build` (Remix Vite build)
- **Production:** `pnpm start` (runs `cross-env NODE_ENV=production tsx server.ts`)
- **Tests:** `pnpm test` (vitest)
- **Lint/format:** `pnpm check:fix` (biome check --write src)
- **Prisma generate:** `npx prisma generate`
- **Prisma migrate:** `npx prisma migrate dev`

## Architecture

### Runtime Stack
- **TypeScript** with **pnpm** as package manager
- **Remix** (v2) on **Express**, built with **Vite**
- **Prisma** ORM with **MySQL** database
- **Redis** for retrieval job status tracking and cancellation signaling
- **Tailwind CSS v4** + **DaisyUI** for styling
- **node-cron** for scheduled daily data retrieval (10:30)

### Server Entry Point
`server.ts` - Custom Express server that:
1. Serves the Remix app
2. Initializes Redis connection
3. Schedules daily cron job for data retrieval

### Data Retrieval Pipeline
The core domain logic is a 3-phase scraping pipeline in `src/commands/RetrieveCommand.ts`:
1. **Calculation phase** - Fetches first page of each region/province/type combo to count total items and pages
2. **Download phase** - Downloads all listing pages, caching HTML in the `Page` table to avoid re-fetching
3. **Processing phase** - Parses cached HTML with XPath/DOM parsing, upserts properties, and tracks price history

The pipeline is orchestrated by `app/services/retrieveCommandService.server.ts` which wraps `RetrieveCommand` with Redis-based progress tracking, cancellation support, and job history recording.

### Two Prisma Clients
There are two PrismaClient singletons (both used, for different contexts):
- `app/utils/db.server.ts` - Used in Remix server code (with global singleton for HMR)
- `src/prisma.ts` - Used in the standalone RetrieveCommand

### Key Data Models
- **Property** - Purchase listings (houses, mansions, land) with `suumo_id` as unique identifier
- **Building** + **RentalUnit** - Rental listings follow a parent-child model; buildings contain multiple units
- **PriceHistory** / **RentalPriceHistory** - Tracks price changes across retrieval runs
- **TrainLine** / **Station** / **BuildingStation** - Transit proximity data for rental buildings
- **Page** - Cached HTML pages from Suumo to avoid redundant fetches
- **RetrievalJob** - Job history with status, progress, and timing

### Route Structure (Remix)
- `/` - Home page
- `/areas/:typeId` - Browse purchase properties by area
- `/properties/:typeId/:areaId/:provinceId` - Purchase property listings
- `/rental/areas/:typeId` - Browse rental properties by area
- `/rental/properties/:typeId/:areaId/:provinceId` - Rental property listings
- `/admin/*` - Admin pages for data retrieval control, job history, and XPath debugging

### Parsing Utilities
- `app/utils/parseUtils.ts` - XPath-based parsing for purchase property HTML pages
- `app/utils/rentalParseUtils.ts` - Parsing for rental property HTML pages (different DOM structure)
- `app/utils/trainUtils.server.ts` - Extracts and stores train station proximity data
- Both have corresponding `.test.ts` files

## Environment Variables
- `DATABASE_URL` - MySQL connection string (required)
- `REDIS_URL` - Redis connection string (defaults to `redis://localhost:6379`)
- `PORT` - Server port (defaults to 3000)
