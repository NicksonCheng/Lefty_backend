import pool from "../db";
import { RowDataPacket } from "mysql2";
import { MerchantData } from "../interface";
// SQL 語句用於插入商家資料。ST_PointFromText 用於從經緯度生成 POINT 欄位。
const INSERT_MERCHANT_SQL = `
  INSERT INTO merchants (
    user_id, store_name, address, phone, lat, lng, location
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ST_PointFromText(CONCAT('POINT(', ?, ' ', ? ,')'), 4326)
  );
`;
export async function checkExistingMerchant(user_id: number): Promise<boolean> {
  const sql = `SELECT 1 FROM merchants WHERE user_id = ? LIMIT 1`;
  const [rows] = await pool.query<RowDataPacket[]>(sql, user_id);
  return rows.length > 0;
}

/**
 * Get merchant info by user_id
 * @param userId - user id
 * @returns merchant data or null
 */
export async function getMerchantByUserId(userId: number): Promise<any | null> {
  const sql = `
    SELECT id, user_id, store_name, address, phone, lat, lng, created_at, updated_at
    FROM merchants 
    WHERE user_id = ? 
    LIMIT 1
  `;
  const [rows] = await pool.query<RowDataPacket[]>(sql, [userId]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * insert merchant into merchants table
 * @param userId - user id related to merchant table
 * @param setupData - include store_name, address, lat, lng, phone
 * @returns merchant id after we inserted
 */
export async function insertNewMerchant(
  userId: number,
  data: MerchantData
): Promise<number> {
  // 注意：MySQL POINT 函數是 POINT(lng, lat)
  const params = [
    userId,
    data.store_name,
    data.address,
    data.phone,
    data.lat,
    data.lng,
    data.lat,
    data.lng, // POINT(lat, lng), MySQL 8.0 強制順序變為：(lat, lng)。
  ];
  console.log(params);
  const [result] = await pool.query<RowDataPacket[]>(
    INSERT_MERCHANT_SQL,
    params
  );
  return (result as any).insertId;
}
