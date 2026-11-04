-- Scale fixture for retrieveMemoryBench.ts: 300k properties, 300k rental units, 40k buildings.
-- Load into a disposable database only; these rows are fake.
SET SESSION cte_max_recursion_depth = 1000000;

INSERT INTO building (region, province, suumo_id, url, building_type, address, stations, postal_code, state, city, last_updated, insert_date)
WITH RECURSIVE s AS (SELECT 1 n UNION ALL SELECT n + 1 FROM s WHERE n < 40000)
SELECT '090', '47', CONCAT('b', n), 'https://x/b', 'apartment', 'addr', '[]', '000-0000', 'Okinawa', 'Naha', NOW(), NOW() FROM s;

INSERT INTO rental_unit (suumo_id, suumo_js_id, url, rent, building_id, last_updated, insert_date)
WITH RECURSIVE s AS (SELECT 1 n UNION ALL SELECT n + 1 FROM s WHERE n < 300000)
SELECT CONCAT('r', n), CONCAT('j', n), 'https://x/r', 50000 + n, 1 + (n MOD 40000), NOW(), NOW() FROM s;

INSERT INTO property (region, province, price, train_line, train_station, address, suumo_id, suumo_js_id, url, property_type, postal_code, state, city, insert_date, last_updated, station_distance_foot)
WITH RECURSIVE s AS (SELECT 1 n UNION ALL SELECT n + 1 FROM s WHERE n < 300000)
SELECT '090', '47', 1000 + n, 'l', 'st', 'addr', CONCAT('p', n), CONCAT('q', n), 'https://x/p', 'land', '000-0000', 'Okinawa', 'Naha', '2026-01-01', NOW(), 0 FROM s;
