CREATE TABLE IF NOT EXISTS provinces (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS districts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  province_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  UNIQUE KEY uq_district_province_name (province_id, name),
  CONSTRAINT fk_districts_province FOREIGN KEY (province_id) REFERENCES provinces(id)
);

CREATE TABLE IF NOT EXISTS sectors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  district_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  UNIQUE KEY uq_sector_district_name (district_id, name),
  CONSTRAINT fk_sectors_district FOREIGN KEY (district_id) REFERENCES districts(id)
);

CREATE TABLE IF NOT EXISTS cells (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sector_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  UNIQUE KEY uq_cell_sector_name (sector_id, name),
  CONSTRAINT fk_cells_sector FOREIGN KEY (sector_id) REFERENCES sectors(id)
);

CREATE TABLE IF NOT EXISTS villages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cell_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  UNIQUE KEY uq_village_cell_name (cell_id, name),
  CONSTRAINT fk_villages_cell FOREIGN KEY (cell_id) REFERENCES cells(id)
);

ALTER TABLE farmers
  ADD COLUMN IF NOT EXISTS province VARCHAR(255) NULL AFTER national_id,
  ADD COLUMN IF NOT EXISTS province_id INT NULL AFTER province,
  ADD COLUMN IF NOT EXISTS district_id INT NULL AFTER district,
  ADD COLUMN IF NOT EXISTS sector_id INT NULL AFTER sector,
  ADD COLUMN IF NOT EXISTS cell_id INT NULL AFTER cell,
  ADD COLUMN IF NOT EXISTS village_id INT NULL AFTER village;

ALTER TABLE farmers
  ADD INDEX IF NOT EXISTS idx_farmers_village_id (village_id);

ALTER TABLE farmers
  ADD CONSTRAINT fk_farmers_village FOREIGN KEY (village_id) REFERENCES villages(id);

SELECT phone, national_id, COUNT(*) AS duplicate_count
FROM farmers
WHERE phone IS NOT NULL AND national_id IS NOT NULL
GROUP BY phone, national_id
HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_farmers_phone_national_id
ON farmers (phone, national_id);

ALTER TABLE farmers
  MODIFY COLUMN phone VARCHAR(50) NOT NULL,
  MODIFY COLUMN national_id VARCHAR(100) NOT NULL;
