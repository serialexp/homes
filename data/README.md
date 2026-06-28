# Bundled data

## canonical-rail-lines.json

Canonical list of Japanese railway lines, used to reconcile/normalize the
scraped `train_line` rows (see `app/utils/canonicalLines.server.ts`).

- **Source:** https://github.com/piuccio/open-data-jp-railway-lines (`lines.json`, `master`)
- **Upstream derivation:** generated from [ekidata.jp](http://www.ekidata.jp) + Wikipedia.
- **Fetched:** 2026-06-28
- **Shape:** array of `{ code, ekidata_id, name_kanji, name_kana, name_romaji, alternative_names[], prefectures[], logo }`.

### Notes / gotchas
- `code` is **empty for ~77%** of rows — do **not** use it as a key. The stable
  identifier is `ekidata_id` (some lines appear under multiple `code` variants
  that share one `ekidata_id`; the loader dedupes by `ekidata_id`).
- `name_romaji` / `name_kana` are occasionally empty — fall back to `name_kanji`.
- `prefectures` uses JIS prefecture codes (e.g. `"13"` = Tokyo), matching the
  province-code keys in `app/data/propertyData.ts`.

### Licensing
The upstream repo does not state an explicit license, and ekidata.jp's own terms
require registration. This is acceptable for the current private deployment but
**must be revisited before any public release**. The loader is written against a
generic canonical-line shape so the source can be swapped for the
clearly-licensed MLIT 国土数値情報 N02 dataset later with minimal changes.
