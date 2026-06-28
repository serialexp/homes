# Changelog

## 0.1.0 (2026-06-28)

### Features

- update dependencies and add dockerfile
- allow inserting multiple items per property
- refresh before loading data
- load environment variables
- install pdo mysql
- convert to typescript
- remix frontend, LLM translation, docker compose, and CI/CD
- replace HTTP Basic Auth with session cookie login page
- add login/logout icons to nav using Phosphor Icons
- replace text header with logo image in nav bar
- add force reset button for stuck retrieval jobs
- display property and rental unit counts on home and area pages
- add actions to history page for stuck retrieval jobs
- mobile-friendly card layout for rental unit listings
- add global loading bar for page transitions
- add dark mode support using DaisyUI semantic colors
- sort by recency and early-terminate retrieval when caught up
- show running git sha in the UI footer
- reconcile train lines against a canonical rail dataset
- add shared admin sub-nav so every admin page is reachable
- persist dry-run proposals and apply the exact previewed set

### Bug Fixes

- use composer file
- extension version
- zip command
- import
- do not output environment vars
- homes clears the existing page table if asked to refresh
- remove non-existent public dir from Dockerfile
- copy app/ directory into production Docker stage
- upgrade to Node 24, add openssl, auto-migrate on startup
- regenerate Prisma client in production stage for correct OpenSSL
- add OpenSSL 3.0.x binary target for Prisma in Docker
- upgrade Prisma to 6.19.2 and fix Docker build for OpenSSL 3
- update Portainer webhook URL
- base ETA on pages during download and items during processing
- admin auth, error boundaries, transactions, and cleanup
- mark interrupted retrieval jobs as failed on server restart
- return auth response instead of throwing to preserve WWW-Authenticate header
- hide admin nav links until authenticated
- move login/logout routes outside admin layout to prevent redirect loop
- trim logo whitespace and increase nav logo size
- add logging to startup job cleanup and always reset idle on restart
- add overflow-x-auto wrapper to remaining tables for mobile scroll
- show Force Reset button for any non-idle status, not just running
- disable Redis RDB persistence to prevent disk write errors
- use actual table names in raw SQL query for rental unit counts
- count cached pages in download progress tracking
- clear stale Redis fields when writing new retrieval status
- update total field in Redis during processing phase
- lock DaisyUI to light theme to prevent dark mode selects
- correct page-count detection and cut import memory
- pin pnpm to v11 and allow build scripts so the image builds
- pass commit message via env in version-extract step

### Performance Improvements

- index building(region,province,last_updated) and rental_unit(building_id,rent)

### Chores

- resize logo from 2MB to 40KB and trim whitespace
- bump CI actions to Node 24 majors

### CI

- trigger Portainer redeploy after Docker image push

### Other

- Initial commit

