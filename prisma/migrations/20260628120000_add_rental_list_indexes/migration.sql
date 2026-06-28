-- Indexes to speed up the paginated rental property list query, which filters
-- `building` by (region, province) and sorts by last_updated, then pulls each
-- building's rental units ordered by rent.

-- Building: covers the equality filter on (region, province) AND the
-- last_updated DESC ordering, turning a full scan + filesort into a range scan.
CREATE INDEX `building_region_province_last_updated_idx` ON `building`(`region`, `province`, `last_updated`);

-- RentalUnit: composite (building_id, rent) serves the per-building
-- rent-ordered include and the price filter. Create it BEFORE dropping the
-- old building_id-only index so the rental_unit_building_id_fkey foreign key
-- always has a covering index (its leftmost column is still building_id).
CREATE INDEX `rental_unit_building_id_rent_idx` ON `rental_unit`(`building_id`, `rent`);
DROP INDEX `rental_unit_building_id_idx` ON `rental_unit`;
