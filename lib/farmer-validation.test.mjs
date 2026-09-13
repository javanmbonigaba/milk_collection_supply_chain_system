import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePhoneNumber,
  isValidRwandaPhoneNumber,
  normalizeNationalId,
  isValidNationalId,
  buildFarmerAddress,
  getProvinceOptions,
  getDistrictOptions,
  getSectorOptions,
  getCellOptions,
  getVillageOptions,
  isValidRwandaAddressHierarchy,
} from './farmer-validation.js';

test('normalizes Rwanda phone numbers', () => {
  assert.equal(normalizePhoneNumber(' 078 123 4567 '), '0781234567');
  assert.equal(normalizePhoneNumber('+250781234567'), '0781234567');
});

test('accepts valid Rwanda phone numbers', () => {
  assert.equal(isValidRwandaPhoneNumber('0781234567'), true);
  assert.equal(isValidRwandaPhoneNumber('250781234567'), true);
});

test('validates national IDs', () => {
  assert.equal(normalizeNationalId(' 119 1234567890123 '), '1191234567890123');
  assert.equal(isValidNationalId('1191234567890123'), true);
  assert.equal(isValidNationalId('11912345678901'), false);
});

test('builds admin address string', () => {
  assert.equal(buildFarmerAddress({ province: 'Northern Province', district: 'Musanze', sector: 'Muhoza', cell: 'Cyuve', village: 'Example Village' }), 'Northern Province → Musanze District → Muhoza Sector → Cyuve Cell → Example Village Village');
});

test('cascades Rwanda address options and rejects mismatched hierarchy', () => {
  assert.deepEqual(getProvinceOptions(), ['Eastern Province', 'Kigali City', 'Northern Province', 'Southern Province', 'Western Province']);
  assert.deepEqual(getDistrictOptions('Northern Province'), ['Musanze', 'Burera']);
  assert.deepEqual(getSectorOptions('Northern Province', 'Musanze'), ['Muhoza', 'Shingiro']);
  assert.deepEqual(getCellOptions('Northern Province', 'Musanze', 'Muhoza'), ['Cyuve', 'Musanze']);
  assert.deepEqual(getVillageOptions('Northern Province', 'Musanze', 'Muhoza', 'Cyuve'), ['Example Village', 'Ruhondo']);
  assert.equal(isValidRwandaAddressHierarchy({ province: 'Northern Province', district: 'Musanze', sector: 'Muhoza', cell: 'Cyuve', village: 'Example Village' }), true);
  assert.equal(isValidRwandaAddressHierarchy({ province: 'Northern Province', district: 'Huye', sector: 'Kigoma', cell: 'Muganza', village: 'Gikomeye' }), false);
});
