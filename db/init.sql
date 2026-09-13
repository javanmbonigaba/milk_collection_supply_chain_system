CREATE DATABASE IF NOT EXISTS new_milk;
USE new_milk;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uid VARCHAR(100) NOT NULL UNIQUE,
  username VARCHAR(100) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  mcc_ids JSON,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100) NULL UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password TINYINT(1) NOT NULL DEFAULT 0;
UPDATE users SET username = CASE uid
  WHEN 'admin-1' THEN 'admin'
  WHEN 'manager-1' THEN 'manager'
  WHEN 'officer-1' THEN 'officer'
  WHEN 'farmer-1' THEN 'demo_farmer'
  WHEN 'collector-1' THEN 'collector'
  WHEN 'vet-1' THEN 'veterinary'
  ELSE CONCAT('user_', id)
END WHERE username IS NULL OR username = '';
ALTER TABLE users MODIFY COLUMN username VARCHAR(100) NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS collector_batch_code VARCHAR(100) NULL UNIQUE;
UPDATE users
SET collector_batch_code = CONCAT(
  'BATCH-', LPAD(id, 2, '0'), '-',
  UPPER(CONCAT(
    LEFT(SUBSTRING_INDEX(TRIM(full_name), ' ', 1), 1),
    LEFT(SUBSTRING_INDEX(TRIM(full_name), ' ', -1), 1)
  ))
)
WHERE role = 'MILK_COLLECTOR' AND (collector_batch_code IS NULL OR collector_batch_code = '');

CREATE TABLE IF NOT EXISTS mccs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mcc_id VARCHAR(50) NOT NULL UNIQUE,
  mcc_code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  district VARCHAR(255),
  sector VARCHAR(255),
  cell VARCHAR(255),
  village VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  manager_user_id VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS milk_collection_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id VARCHAR(100) NOT NULL UNIQUE,
  farmer_id VARCHAR(100) NOT NULL,
  collector_id VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP NULL,
  INDEX idx_collection_requests_collector (collector_id, status),
  INDEX idx_collection_requests_farmer (farmer_id, status),
  CONSTRAINT fk_collection_request_farmer FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  audit_id VARCHAR(100) NOT NULL UNIQUE,
  user_id VARCHAR(100) NOT NULL,
  action VARCHAR(100) NOT NULL,
  module VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key_name VARCHAR(100) NOT NULL UNIQUE,
  value_text VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS breed_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  breed_name VARCHAR(100) NOT NULL UNIQUE,
  created_by VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO breed_types (breed_name, created_by)
VALUES ('Friesian', 'system'), ('Jersey', 'system'), ('Ayrshire', 'system'), ('Ankole', 'system')
ON DUPLICATE KEY UPDATE breed_name = VALUES(breed_name);

INSERT INTO users (uid, username, full_name, email, password, role, mcc_ids, status)
VALUES
  ('admin-1', 'admin', 'System Administrator', 'admin@milk.local', 'admin123', 'SUPER_ADMIN', JSON_ARRAY('MCC-001'), 'ACTIVE'),
  ('manager-1', 'manager', 'MCC Manager', 'manager@milk.local', 'manager123', 'MCC_MANAGER', JSON_ARRAY('MCC-001'), 'ACTIVE'),
  ('officer-1', 'officer', 'MCC Officer', 'officer@milk.local', 'officer123', 'MCC_OFFICER', JSON_ARRAY('MCC-001'), 'ACTIVE'),
  ('farmer-1', 'demo_farmer', 'Demo Farmer', 'farmer@milk.local', 'farmer123', 'FARMER', JSON_ARRAY('MCC-001'), 'ACTIVE'),
  ('collector-1', 'collector', 'Milk Collector', 'collector@milk.local', 'collector123', 'MILK_COLLECTOR', JSON_ARRAY('MCC-001'), 'ACTIVE'),
  ('vet-1', 'veterinary', 'Veterinary Officer', 'vet@milk.local', 'vet123', 'VETERINARY_OFFICER', JSON_ARRAY('MCC-001'), 'ACTIVE')
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  username = VALUES(username),
  password = VALUES(password),
  role = VALUES(role),
  mcc_ids = VALUES(mcc_ids),
  status = VALUES(status);

INSERT INTO mccs (mcc_id, mcc_code, name, description, district, sector, cell, village, phone, email, manager_user_id, status)
VALUES
  ('MCC-001', 'MCC-001', 'Example Milk Collection Center', 'Main collection center for cooperative operations', 'Kigali', 'Nyarugenge', 'Kigali City', 'Kimisagara', '+250788000001', 'mcc001@milk.local', 'manager-1', 'ACTIVE')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  district = VALUES(district),
  sector = VALUES(sector),
  cell = VALUES(cell),
  village = VALUES(village),
  phone = VALUES(phone),
  email = VALUES(email),
  manager_user_id = VALUES(manager_user_id),
  status = VALUES(status);

INSERT INTO audit_logs (audit_id, user_id, action, module, entity_type, entity_id, description)
VALUES
  ('audit-1', 'admin-1', 'LOGIN', 'auth', 'user', 'admin-1', 'System administrator logged in successfully.'),
  ('audit-2', 'admin-1', 'MCC_CREATED', 'mcc', 'mccCenter', 'MCC-001', 'MCC-001 was created in the system.')
ON DUPLICATE KEY UPDATE
  user_id = VALUES(user_id),
  action = VALUES(action),
  module = VALUES(module),
  entity_type = VALUES(entity_type),
  entity_id = VALUES(entity_id),
  description = VALUES(description);

INSERT INTO settings (key_name, value_text)
VALUES
  ('projectName', 'Digital Milk Collection System'),
  ('milkPrice', '620'),
  ('mccSharePercent', '10'),
  ('collectorSharePercent', '5'),
  ('timezone', 'UTC'),
  ('notificationEmail', 'notify@milk.local')
ON DUPLICATE KEY UPDATE
  value_text = VALUES(value_text);

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

CREATE TABLE IF NOT EXISTS farmers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  farmer_id VARCHAR(100) NOT NULL UNIQUE,
  user_id VARCHAR(100) UNIQUE,
  registered_by VARCHAR(100),
  full_name VARCHAR(255) NOT NULL,
  national_id VARCHAR(100) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  province VARCHAR(255) NULL,
  district VARCHAR(255),
  sector VARCHAR(255),
  cell VARCHAR(255),
  village VARCHAR(255),
  mcc_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  INDEX idx_farmers_mcc (mcc_id),
  UNIQUE KEY uq_farmers_phone_national_id (phone, national_id),
  CONSTRAINT fk_farmers_mcc FOREIGN KEY (mcc_id) REFERENCES mccs(mcc_id)
);

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS user_id VARCHAR(100) UNIQUE;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS registered_by VARCHAR(100);
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS province VARCHAR(255) NULL;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS province_id INT NULL;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS district_id INT NULL;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS sector_id INT NULL;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS cell_id INT NULL;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS village_id INT NULL;
ALTER TABLE farmers ADD UNIQUE INDEX IF NOT EXISTS uq_farmers_phone_national_id (phone, national_id);
ALTER TABLE farmers MODIFY COLUMN national_id VARCHAR(100) NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100);

CREATE TABLE IF NOT EXISTS cow_registration_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_id VARCHAR(100) NOT NULL UNIQUE,
  authorization_session_id VARCHAR(100) NOT NULL UNIQUE,
  farmer_id VARCHAR(100) NOT NULL,
  requested_by VARCHAR(100) NOT NULL,
  cow_count INT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  authorized_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  INDEX idx_cow_registration_batches_farmer (farmer_id, status),
  INDEX idx_cow_registration_batches_requester (requested_by, status),
  CONSTRAINT fk_cow_registration_batch_farmer FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id)
);
ALTER TABLE cow_registration_batches ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL;

CREATE TABLE IF NOT EXISTS cow_registration_authorizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  authorization_session_id VARCHAR(100) NOT NULL UNIQUE,
  batch_id VARCHAR(100) NOT NULL UNIQUE,
  farmer_id VARCHAR(100) NOT NULL,
  otp_hash CHAR(64) NOT NULL,
  otp_code CHAR(6) NOT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  verified_at DATETIME NULL,
  used_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  resend_count INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  INDEX idx_cow_auth_farmer_status (farmer_id, status),
  CONSTRAINT fk_cow_registration_auth_batch FOREIGN KEY (batch_id) REFERENCES cow_registration_batches(batch_id),
  CONSTRAINT fk_cow_registration_auth_farmer FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id)
);
ALTER TABLE cow_registration_authorizations ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL;
ALTER TABLE cow_registration_authorizations ADD COLUMN IF NOT EXISTS resend_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS cow_registration_batch_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_id VARCHAR(100) NOT NULL,
  animal_id VARCHAR(100) NOT NULL UNIQUE,
  tag_number VARCHAR(100) NOT NULL,
  breed VARCHAR(100) NOT NULL,
  sex VARCHAR(20) NOT NULL,
  UNIQUE KEY uq_cow_registration_batch_animal (batch_id, animal_id),
  UNIQUE KEY uq_cow_registration_batch_tag (batch_id, tag_number),
  CONSTRAINT fk_cow_registration_item_batch FOREIGN KEY (batch_id) REFERENCES cow_registration_batches(batch_id)
);

CREATE TABLE IF NOT EXISTS animals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  animal_id VARCHAR(100) NOT NULL UNIQUE,
  farmer_id VARCHAR(100) NOT NULL,
  tag_number VARCHAR(100) NOT NULL UNIQUE,
  breed VARCHAR(100),
  sex VARCHAR(20) NOT NULL DEFAULT 'FEMALE',
  date_of_birth DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  registration_batch_id VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_animals_farmer (farmer_id),
  INDEX idx_animals_registration_batch (registration_batch_id),
  CONSTRAINT fk_animals_farmer FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id)
);
ALTER TABLE animals ADD COLUMN IF NOT EXISTS registration_batch_id VARCHAR(100) NULL;
ALTER TABLE animals ADD INDEX IF NOT EXISTS idx_animals_registration_batch (registration_batch_id);

CREATE TABLE IF NOT EXISTS milk_collections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collection_id VARCHAR(100) NOT NULL UNIQUE,
  farmer_id VARCHAR(100) NOT NULL,
  mcc_id VARCHAR(50) NOT NULL,
  collection_date DATETIME NOT NULL,
  collection_source VARCHAR(40) NOT NULL DEFAULT 'FARMER_COLLECTION_CHAIN',
  litres DECIMAL(10,2) NOT NULL,
  fat_percentage DECIMAL(5,2),
  temperature_c DECIMAL(5,2),
  acceptance_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  collector_acceptance_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  mcc_acceptance_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  mcc_comment TEXT,
  notes TEXT,
  collected_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_collections_date (collection_date),
  INDEX idx_collections_farmer (farmer_id),
  CONSTRAINT fk_collections_farmer FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id),
  CONSTRAINT fk_collections_mcc FOREIGN KEY (mcc_id) REFERENCES mccs(mcc_id)
);
ALTER TABLE milk_collections ADD COLUMN IF NOT EXISTS animal_id VARCHAR(100) NULL AFTER farmer_id;
ALTER TABLE milk_collections ADD COLUMN IF NOT EXISTS collection_source VARCHAR(40) NOT NULL DEFAULT 'FARMER_COLLECTION_CHAIN';
ALTER TABLE milk_collections ADD INDEX IF NOT EXISTS idx_collections_animal (animal_id);

ALTER TABLE milk_collections ADD COLUMN IF NOT EXISTS collector_acceptance_status VARCHAR(20) NOT NULL DEFAULT 'PENDING';
ALTER TABLE milk_collections ADD COLUMN IF NOT EXISTS mcc_acceptance_status VARCHAR(20) NOT NULL DEFAULT 'PENDING';
ALTER TABLE milk_collections ADD COLUMN IF NOT EXISTS mcc_comment TEXT;

CREATE TABLE IF NOT EXISTS quality_tests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  test_id VARCHAR(100) NOT NULL UNIQUE,
  collection_id VARCHAR(100) NOT NULL,
  acidity DECIMAL(5,2),
  density DECIMAL(6,3),
  adulteration_detected BOOLEAN NOT NULL DEFAULT FALSE,
  organoleptic_result VARCHAR(10),
  lactometer_reading DECIMAL(6,3),
  alcohol_test_result VARCHAR(10),
  comment TEXT,
  result VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  tested_by VARCHAR(100) NOT NULL,
  tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_quality_collection (collection_id),
  CONSTRAINT fk_quality_collection FOREIGN KEY (collection_id) REFERENCES milk_collections(collection_id)
);
ALTER TABLE quality_tests ADD COLUMN IF NOT EXISTS organoleptic_result VARCHAR(10) NULL;
ALTER TABLE quality_tests ADD COLUMN IF NOT EXISTS lactometer_reading DECIMAL(6,3) NULL;
ALTER TABLE quality_tests ADD COLUMN IF NOT EXISTS alcohol_test_result VARCHAR(10) NULL;
ALTER TABLE quality_tests ADD COLUMN IF NOT EXISTS comment TEXT NULL;

CREATE TABLE IF NOT EXISTS veterinary_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  record_id VARCHAR(100) NOT NULL UNIQUE,
  animal_id VARCHAR(100) NOT NULL,
  visit_date DATE NOT NULL,
  diagnosis VARCHAR(255) NOT NULL,
  treatment TEXT,
  medicine VARCHAR(255),
  withdrawal_until DATE,
  veterinarian_id VARCHAR(100) NOT NULL,
  notes TEXT,
  clearance_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vet_animal (animal_id),
  CONSTRAINT fk_vet_animal FOREIGN KEY (animal_id) REFERENCES animals(animal_id)
);

CREATE TABLE IF NOT EXISTS milk_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_id VARCHAR(100) NOT NULL UNIQUE,
  mcc_id VARCHAR(50) NOT NULL,
  collector_id VARCHAR(100) NULL,
  parent_batch_code VARCHAR(100) NULL,
  batch_date DATE NOT NULL,
  total_litres DECIMAL(10,2) NOT NULL DEFAULT 0,
  destination VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  approval_comment TEXT NULL,
  approved_by VARCHAR(100) NULL,
  approved_at DATETIME NULL,
  created_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_batches_date (batch_date),
  CONSTRAINT fk_batches_mcc FOREIGN KEY (mcc_id) REFERENCES mccs(mcc_id)
);
ALTER TABLE milk_batches ADD COLUMN IF NOT EXISTS collector_id VARCHAR(100) NULL;
ALTER TABLE milk_batches ADD COLUMN IF NOT EXISTS parent_batch_code VARCHAR(100) NULL;
ALTER TABLE milk_batches ADD COLUMN IF NOT EXISTS approval_comment TEXT NULL;
ALTER TABLE milk_batches ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100) NULL;
ALTER TABLE milk_batches ADD COLUMN IF NOT EXISTS approved_at DATETIME NULL;
UPDATE milk_batches b
JOIN users u ON u.uid = b.created_by AND u.role = 'MILK_COLLECTOR'
SET b.collector_id = u.uid, b.parent_batch_code = u.collector_batch_code
WHERE b.collector_id IS NULL;

CREATE TABLE IF NOT EXISTS collector_batch_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id VARCHAR(100) NOT NULL UNIQUE,
  collector_id VARCHAR(100) NOT NULL,
  mcc_id VARCHAR(50) NOT NULL,
  batch_code VARCHAR(100) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  assigned_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_collector_batch_assignments_collector (collector_id, status)
);

CREATE TABLE IF NOT EXISTS farmer_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payment_id VARCHAR(100) NOT NULL UNIQUE,
  farmer_id VARCHAR(100) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  litres DECIMAL(10,2) NOT NULL DEFAULT 0,
  rate_per_litre DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  paid_at DATETIME NULL,
  processed_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_payments_farmer (farmer_id),
  CONSTRAINT fk_payments_farmer FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id)
);

CREATE TABLE IF NOT EXISTS collector_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payment_id VARCHAR(100) NOT NULL UNIQUE,
  collector_id VARCHAR(100) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  litres DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  paid_at DATETIME NULL,
  approved_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_collector_payment_period (collector_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS expense_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type_name VARCHAR(100) NOT NULL UNIQUE,
  created_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expense_id VARCHAR(100) NOT NULL UNIQUE,
  expense_date DATE NOT NULL,
  expense_name VARCHAR(255) NOT NULL,
  expense_type VARCHAR(100) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  recorded_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_expenses_date (expense_date)
);

CREATE TABLE IF NOT EXISTS administration_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id VARCHAR(100) NOT NULL UNIQUE,
  requested_by VARCHAR(100) NOT NULL,
  request_type VARCHAR(50) NOT NULL,
  details TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  approved_by VARCHAR(100) NULL,
  approved_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS milk_batch_collections (
  batch_id VARCHAR(100) NOT NULL,
  collection_id VARCHAR(100) NOT NULL,
  PRIMARY KEY (batch_id, collection_id),
  CONSTRAINT fk_batch_collections_batch FOREIGN KEY (batch_id) REFERENCES milk_batches(batch_id),
  CONSTRAINT fk_batch_collections_collection FOREIGN KEY (collection_id) REFERENCES milk_collections(collection_id)
);

INSERT INTO farmers (farmer_id, user_id, full_name, national_id, phone, mcc_id, status)
VALUES ('FARMER-001', 'farmer-1', 'Demo Farmer', 'DEMO-001', '+250788000010', 'MCC-001', 'ACTIVE')
ON DUPLICATE KEY UPDATE
  user_id = VALUES(user_id),
  full_name = VALUES(full_name),
  phone = VALUES(phone),
  mcc_id = VALUES(mcc_id),
  status = VALUES(status);
