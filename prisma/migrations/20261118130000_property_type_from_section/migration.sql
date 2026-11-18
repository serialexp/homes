-- property_type used to come from the first pill on a listing card, which is usually a marketing label
-- (購入サポート情報 and the like) rather than the type. The search section is what says which type a listing is,
-- so set property_type from section_type. Listings without a section_type keep what they have.
UPDATE `property`
SET `property_type` = CASE `section_type`
    WHEN '030' THEN '土地'
    WHEN '021' THEN '中古一戸建て'
    WHEN '020' THEN '新築一戸建て'
    WHEN '011' THEN '中古マンション'
    WHEN '010' THEN '新築マンション'
  END
WHERE `section_type` IN ('030', '021', '020', '011', '010');
