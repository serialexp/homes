# Changes to japan-geographic.svg

The map is `japan-geographic.svg` from [memolog/japan-map-assets](https://github.com/memolog/japan-map-assets) (MIT; data CC BY 4.0, see the notices in this folder). Changes made in this repository:

1. The `viewBox` is cropped from `0 0 1200 1200` to `30 160 860 880` so Japan fills more of the map area. Shapes are unchanged.
2. A `pref-counts` group was added at the end of the SVG. It holds one empty `<text class="pref-count" data-code="NN">` per prefecture, placed by `src/scripts/generatePrefectureLabels.ts`, plus a `pref-leader` path that joins labels moved away from their prefecture. The app fills in the numbers at runtime.
