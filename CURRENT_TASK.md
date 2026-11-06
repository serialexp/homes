# Current task: prefecture count labels on the area page map

## Status
Done. Layout accepted by Bart (option 1: keep the current layout). Committed with the map feature.

## What was built
- `public/japan-prefectures.svg` (memolog/japan-map-assets, MIT, CC BY 4.0 data) has:
  - a cropped viewBox (`30 160 860 880`), so Japan fills more of the map;
  - a `pref-counts` group with one empty `<text class="pref-count" data-code>` per prefecture, plus leader lines for the labels moved out of crowded spots.
  Positions come from `src/scripts/generatePrefectureLabels.ts` (run with `--write` to regenerate). Layout helpers and tests are in `src/scripts/prefectureLabelLayout.ts` and its `.test.ts`.
- The component fills in the numbers only. The hover highlight is on `path[data-code]`.
- `app/routes/areas.$typeId.tsx`: the map column is `lg:w-[560px]` on large screens.
- `public/map-licenses/CHANGES.md` records the changes made to the SVG (CC BY 4.0 requires this).

## Known limits
- Label font is 16 map units (about 10px at 560px wide). 37 of 47 labels are moved out with leader lines; Kansai and Chugoku are still tight.
- The real area page is not verified in a browser: there is no `DATABASE_URL` in this environment. It was checked on a scratch page with sample counts.
- Ogasawara (part of Tokyo's path) is outside the cropped viewBox.
