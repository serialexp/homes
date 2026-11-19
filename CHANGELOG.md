# Changelog

## 0.1.0 (2026-11-19)

### Features

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
- run retrieval jobs in a separate worker process
- add one-off merge of legacy rental buildings
- store the search section on each property
- pace suumo requests and stream progress over SSE
- show a prefecture map beside the area list
- draw prefecture item counts over the map
- record per-section results for each job
- port the redesign theme to a DaisyUI theme
- replace the SVG map with a prefecture tile map and list view
- redesign header and footer
- port the redesign home page
- add listing detail page at /property/:id
- port the listings screen with working filters
- restyle the rental area page with the area explorer
- port the rental listings with train line, station and rent filters
- restyle the admin shell and dashboard
- restyle the retrieval and job history pages
- restyle the rental buildings and units pages
- restyle the train line reconciliation page
- restyle the XPath debug pages
- restyle the login page and restrict redirects to this site
- serve Suumo images through a cached proxy on this site
- parse Suumo detail pages into spec facts and the full photo gallery
- store Suumo detail facts, photos and read requests per property
- decide when a property's Suumo detail page should be read
- read queued Suumo detail pages in the retrieval worker
- show Suumo detail specs and photos, updating while they are read
- retrieve new mansions from their own search page
- read new mansion project pages and their outline

### Bug Fixes

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
- require admin login for retrieval endpoints
- report a cancelled section as cancelled, not completed
- key rental buildings by their listing building id
- lower default suumo request interval to 500ms
- count main page properties by section_type
- stop pinning purchase searches to Tokyo
- take region and province from the listing address
- write the status in one step and read a partial one as unknown
- cap the job history page size and page number
- page the proposal table instead of sending every row
- show item counts in the items row instead of section counts
- fetch Suumo photos at 1024x768 instead of the stored thumbnail size
- stop retrieving New mansion, whose Suumo listing endpoint always answers 500
- take property type from the search section, and read a mansion's floor area

### Performance Improvements

- index building(region,province,last_updated) and rental_unit(building_id,rent)
- look up each page's rows instead of loading whole tables
- cache rental area counts and refresh them when a retrieval finishes
- cache the front-page totals alongside the rental counts
- cache the buy area counts per property type

### Documentation

- note the docker build context leak and the missing image pipeline
- note New mansion support, parser field quality and the duplicated area table
- drop the finished items, note the Docker Hub secrets and the stale branch

### Refactoring

- share the pagination control
- use the shared pagination component
- share the area explorer and restyle the buy areas page
- remove the refresh option everywhere
- move the paced, retrying Suumo fetch into a shared client
- read the area table from propertyData instead of a copy

### Chores

- resize logo from 2MB to 40KB and trim whitespace
- bump CI actions to Node 24 majors
- add large logo as public/logo_large.png
- backfill property region and province from address
- mount a volume for the image cache
- allowlist Suumo's public Maps key in the detail-page fixture

### Build

- keep host files out of the build context, and run the tests in the build

### CI

- build images and cut releases on Gothab

