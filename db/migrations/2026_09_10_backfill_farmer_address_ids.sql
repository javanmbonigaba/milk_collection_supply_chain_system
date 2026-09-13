-- Backfills farmers registered before the Rwanda address hierarchy (province/*_id columns)
-- was fully wired into createFarmer, so historical rows carry the same location
-- data as newly registered farmers.
UPDATE farmers f
JOIN districts d ON d.name = f.district
JOIN sectors s ON s.district_id = d.id AND s.name = f.sector
JOIN cells c ON c.sector_id = s.id AND c.name = f.cell
JOIN villages v ON v.cell_id = c.id AND v.name = f.village
JOIN provinces p ON p.id = d.province_id
SET
  f.province = p.name,
  f.province_id = p.id,
  f.district_id = d.id,
  f.sector_id = s.id,
  f.cell_id = c.id,
  f.village_id = v.id
WHERE f.district IS NOT NULL
  AND f.sector IS NOT NULL
  AND f.cell IS NOT NULL
  AND f.village IS NOT NULL
  AND (f.village_id IS NULL OR f.province IS NULL);
