import { createRequire } from "module";

// rwanda-geo's ESM build (dist/index.mjs) relies on a CJS `require` shim that
// throws under Node's native ESM loader (this project is "type": "module"),
// which silently empties every province/district/... list. Load the package's
// CommonJS build instead, where `require` works correctly.
const require = createRequire(import.meta.url);
const {
  getAllProvinces,
  getCellsBySector,
  getDistrictsByProvince,
  getSectorsByDistrict,
  getVillagesByCell,
} = require("rwanda-geo");

const names = (items) => items.map((item) => item.name);

export function getCompleteProvinceOptions() {
  return names(getAllProvinces());
}

export function getCompleteDistrictOptions(province) {
  const selected = getAllProvinces().find((item) => item.name === province);
  return selected ? names(getDistrictsByProvince(selected.code)) : [];
}

export function getCompleteSectorOptions(province, district) {
  const selectedProvince = getAllProvinces().find((item) => item.name === province);
  if (!selectedProvince) return [];
  const selectedDistrict = getDistrictsByProvince(selectedProvince.code).find((item) => item.name === district);
  return selectedDistrict ? names(getSectorsByDistrict(selectedDistrict.code)) : [];
}

export function getCompleteCellOptions(province, district, sector) {
  const selectedProvince = getAllProvinces().find((item) => item.name === province);
  if (!selectedProvince) return [];
  const selectedDistrict = getDistrictsByProvince(selectedProvince.code).find((item) => item.name === district);
  if (!selectedDistrict) return [];
  const selectedSector = getSectorsByDistrict(selectedDistrict.code).find((item) => item.name === sector);
  return selectedSector ? names(getCellsBySector(selectedSector.code)) : [];
}

export function getCompleteVillageOptions(province, district, sector, cell) {
  const selectedProvince = getAllProvinces().find((item) => item.name === province);
  if (!selectedProvince) return [];
  const selectedDistrict = getDistrictsByProvince(selectedProvince.code).find((item) => item.name === district);
  if (!selectedDistrict) return [];
  const selectedSector = getSectorsByDistrict(selectedDistrict.code).find((item) => item.name === sector);
  if (!selectedSector) return [];
  const selectedCell = getCellsBySector(selectedSector.code).find((item) => item.name === cell);
  return selectedCell ? names(getVillagesByCell(selectedCell.code)) : [];
}

export function isValidCompleteRwandaAddress({ province, district, sector, cell, village }) {
  return getCompleteVillageOptions(province, district, sector, cell).includes(village);
}
