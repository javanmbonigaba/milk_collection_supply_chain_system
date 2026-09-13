import mysql from "mysql2/promise";
import { createRequire } from "module";

// rwanda-geo's ESM build throws under Node's native ESM loader (this project
// is "type": "module"), so load the package's CommonJS build instead.
const require = createRequire(import.meta.url);
const {
  getAllProvinces,
  getCellsBySector,
  getDistrictsByProvince,
  getSectorsByDistrict,
  getVillagesByCell,
} = require("rwanda-geo");

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "new_milk",
});

try {
  await connection.beginTransaction();
  const provinceIds = new Map();
  const districtIds = new Map();
  const sectorIds = new Map();
  const cellIds = new Map();
  for (const province of getAllProvinces()) {
    await connection.execute("INSERT INTO provinces (name, code) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)", [province.name, province.code]);
    const [[provinceRow]] = await connection.query("SELECT id FROM provinces WHERE code = ?", [province.code]);
    provinceIds.set(province.code, provinceRow.id);
    for (const district of getDistrictsByProvince(province.code)) {
      await connection.execute("INSERT INTO districts (province_id, name, code) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), province_id = VALUES(province_id)", [provinceRow.id, district.name, district.code]);
      const [[districtRow]] = await connection.query("SELECT id FROM districts WHERE code = ?", [district.code]);
      districtIds.set(district.code, districtRow.id);
      for (const sector of getSectorsByDistrict(district.code)) {
        await connection.execute("INSERT INTO sectors (district_id, name, code) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), district_id = VALUES(district_id)", [districtRow.id, sector.name, sector.code]);
        const [[sectorRow]] = await connection.query("SELECT id FROM sectors WHERE code = ?", [sector.code]);
        sectorIds.set(sector.code, sectorRow.id);
        for (const cell of getCellsBySector(sector.code)) {
          await connection.execute("INSERT INTO cells (sector_id, name, code) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), sector_id = VALUES(sector_id)", [sectorRow.id, cell.name, cell.code]);
          const [[cellRow]] = await connection.query("SELECT id FROM cells WHERE code = ?", [cell.code]);
          cellIds.set(cell.code, cellRow.id);
          for (const village of getVillagesByCell(cell.code)) {
            await connection.execute("INSERT INTO villages (cell_id, name, code) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), cell_id = VALUES(cell_id)", [cellRow.id, village.name, village.code]);
          }
        }
      }
    }
  }
  await connection.commit();
  console.log("Imported Rwanda locations: 5 provinces, 30 districts, 416 sectors, 2,148 cells, 14,837 villages.");
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}