export const RWANDA_ADDRESS_TREE = {
  "Northern Province": {
    districts: [
      {
        name: "Musanze",
        sectors: [
          {
            name: "Muhoza",
            cells: [
              { name: "Cyuve", villages: ["Example Village", "Ruhondo"] },
              { name: "Musanze", villages: ["Kigeyo", "Nyagisenyi"] },
            ],
          },
          {
            name: "Shingiro",
            cells: [
              { name: "Gataraga", villages: ["Ruhanga", "Kabere"] },
              { name: "Kigali", villages: ["Mubuga", "Kisaro"] },
            ],
          },
        ],
      },
      {
        name: "Burera",
        sectors: [
          {
            name: "Rwerere",
            cells: [
              { name: "Kagogo", villages: ["Kageyo", "Tumba"] },
              { name: "Rwerere", villages: ["Buhoro", "Kinyeganye"] },
            ],
          },
        ],
      },
    ],
  },
  "Southern Province": {
    districts: [
      {
        name: "Huye",
        sectors: [
          {
            name: "Kigoma",
            cells: [
              { name: "Muganza", villages: ["Gikomeye", "Rwasave"] },
              { name: "Tumba", villages: ["Kayonza", "Mabare"] },
            ],
          },
        ],
      },
      {
        name: "Nyanza",
        sectors: [
          {
            name: "Busasamana",
            cells: [
              { name: "Ruhango", villages: ["Kigembe", "Munyinya"] },
              { name: "Gasayo", villages: ["Mubuga", "Musha"] },
            ],
          },
        ],
      },
    ],
  },
  "Eastern Province": {
    districts: [
      {
        name: "Kayonza",
        sectors: [
          {
            name: "Murama",
            cells: [
              { name: "Gahini", villages: ["Kabare", "Murehe"] },
              { name: "Kibungo", villages: ["Nyiramwiza", "Gisiza"] },
            ],
          },
        ],
      },
      {
        name: "Rwamagana",
        sectors: [
          {
            name: "Fumbwe",
            cells: [
              { name: "Nyarusange", villages: ["Nyarubuye", "Ruvugiza"] },
              { name: "Kibare", villages: ["Mburabuturo", "Ruvumu"] },
            ],
          },
        ],
      },
    ],
  },
  "Western Province": {
    districts: [
      {
        name: "Rubavu",
        sectors: [
          {
            name: "Nyundo",
            cells: [
              { name: "Kavumu", villages: ["Busoro", "Murama"] },
              { name: "Rubavu", villages: ["Karengera", "Gashaki"] },
            ],
          },
        ],
      },
      {
        name: "Karongi",
        sectors: [
          {
            name: "Gashari",
            cells: [
              { name: "Mubuga", villages: ["Rugabano", "Rugenge"] },
              { name: "Kigeyo", villages: ["Gatovu", "Kabere"] },
            ],
          },
        ],
      },
    ],
  },
  "Kigali City": {
    districts: [
      {
        name: "Gasabo",
        sectors: [
          {
            name: "Kacyiru",
            cells: [
              { name: "Kigali", villages: ["Kigali Village", "Nyarutarama"] },
              { name: "Kimihurura", villages: ["Mumena", "Remera"] },
            ],
          },
        ],
      },
      {
        name: "Nyarugenge",
        sectors: [
          {
            name: "Gitega",
            cells: [
              { name: "Kigali Heights", villages: ["Kimisagara", "Rugando"] },
              { name: "Mumena", villages: ["Town Hall", "Kabeza"] },
            ],
          },
        ],
      },
    ],
  },
};

export function normalizePhoneNumber(value) {
  const normalized = String(value ?? "").replace(/\s+/g, "").replace(/[^0-9+]/g, "");
  if (!normalized) return "";
  if (normalized.startsWith("+250")) return `0${normalized.slice(4)}`;
  if (normalized.startsWith("250")) return `0${normalized.slice(3)}`;
  return normalized;
}

export function isValidRwandaPhoneNumber(value) {
  const normalized = normalizePhoneNumber(value);
  return /^0[0-9]{9}$/.test(normalized) && /^(078|079|073|072|075|076|077)/.test(normalized);
}

export function normalizeNationalId(value) {
  return String(value ?? "").replace(/\s+/g, "").replace(/[^0-9]/g, "");
}

export function isValidNationalId(value) {
  const normalized = normalizeNationalId(value);
  return /^\d{16}$/.test(normalized);
}

export function buildFarmerAddress({ province, district, sector, cell, village }) {
  const parts = [
    province,
    district && `${district} District`,
    sector && `${sector} Sector`,
    cell && `${cell} Cell`,
    village && `${village} Village`,
  ].filter(Boolean);
    return parts.length ? parts.join(" → ") : "";
}

export function getProvinceOptions() {
  return Object.keys(RWANDA_ADDRESS_TREE).sort();
}

export function getDistrictOptions(province) {
  const provinceData = RWANDA_ADDRESS_TREE[province];
  return provinceData ? provinceData.districts.map((district) => district.name) : [];
}

export function getSectorOptions(province, district) {
  const provinceData = RWANDA_ADDRESS_TREE[province];
  if (!provinceData) return [];
  const selectedDistrict = provinceData.districts.find((entry) => entry.name === district);
  return selectedDistrict ? selectedDistrict.sectors.map((sector) => sector.name) : [];
}

export function getCellOptions(province, district, sector) {
  const provinceData = RWANDA_ADDRESS_TREE[province];
  if (!provinceData) return [];
  const selectedDistrict = provinceData.districts.find((entry) => entry.name === district);
  if (!selectedDistrict) return [];
  const selectedSector = selectedDistrict.sectors.find((entry) => entry.name === sector);
  return selectedSector ? selectedSector.cells.map((cell) => cell.name) : [];
}

export function getVillageOptions(province, district, sector, cell) {
  const provinceData = RWANDA_ADDRESS_TREE[province];
  if (!provinceData) return [];
  const selectedDistrict = provinceData.districts.find((entry) => entry.name === district);
  if (!selectedDistrict) return [];
  const selectedSector = selectedDistrict.sectors.find((entry) => entry.name === sector);
  if (!selectedSector) return [];
  const selectedCell = selectedSector.cells.find((entry) => entry.name === cell);
  return selectedCell ? selectedCell.villages : [];
}

export function isValidRwandaAddressHierarchy({ province, district, sector, cell, village }) {
  const provinceData = RWANDA_ADDRESS_TREE[province];
  if (!provinceData) return false;
  const districtMatch = provinceData.districts.find((entry) => entry.name === district);
  if (!districtMatch) return false;
  const sectorMatch = districtMatch.sectors.find((entry) => entry.name === sector);
  if (!sectorMatch) return false;
  const cellMatch = sectorMatch.cells.find((entry) => entry.name === cell);
  if (!cellMatch) return false;
  return cellMatch.villages.includes(village);
}
