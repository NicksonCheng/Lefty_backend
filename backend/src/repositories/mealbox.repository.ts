import pool from "../db";
import { RowDataPacket } from "mysql2";

// insert mealbox with merchant_id and products array
const INSERT_MEALBOX_SQL = `
  INSERT INTO mealboxes (
    merchant_id, name, description, original_price, discount_price, 
    quantity, pickup_time_start, pickup_time_end, img_url, is_active
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1);
`;

// update mealbox by id and merchant_id
const UPDATE_MEALBOX_SQL = `
  UPDATE mealboxes
  SET
    name = ?, description = ?, original_price = ?, discount_price = ?, 
    quantity = ?, pickup_time_start = ?, pickup_time_end = ?, img_url = ?,
    is_active = 1 -- 確保更新時是上架狀態
  WHERE id = ? AND merchant_id = ?;
`;

// search nearby merchants with mealboxes
// 注意：POINT(經度, 緯度) = POINT(lng, lat)
const NEARBY_QUERY_SQL = `
    SELECT 
        m.id AS merchant_id,
        m.store_name,
        m.lat, m.lng,
        ST_Distance_Sphere(
            m.location,
            ST_GeomFromText(CONCAT('POINT(', ?, ' ', ?, ')'), 4326)
        ) AS distance_m,
        JSON_ARRAYAGG(
            JSON_OBJECT(
                'id', b.id,
                'name', b.name,
                'discount_price', b.discount_price,
                'quantity', b.quantity,
                'pickup_time', CONCAT(b.pickup_time_start, '-', b.pickup_time_end)
            )
        ) AS mealboxes
    FROM merchants m
    JOIN mealboxes b ON m.id = b.merchant_id
    WHERE 
        ST_Distance_Sphere(
            m.location,
            ST_GeomFromText(CONCAT('POINT(', ?, ' ', ?, ')'), 4326)
        ) <= ?
        AND b.is_active = 1
        AND b.quantity > 0
    GROUP BY m.id
    ORDER BY distance_m ASC
    LIMIT ?;
`;

export async function findNearbyMerchants(
  lat: number,
  lng: number,
  radius: number,
  limit: number
) {
  // 將參數整理好，避免 API 路由層混亂
  // 注意：這個 MySQL 版本中 POINT 的順序需要是 POINT(lat, lng)
  // 與標準的 POINT(X=lng, Y=lat) 不同，需要反過來
  const params = [lat, lng, lat, lng, radius, limit];

  // 執行查詢
  const [rows] = await pool.query<RowDataPacket[]>(NEARBY_QUERY_SQL, params);

  // JSON_ARRAYAGG 已經返回 JSON 物件，不需要再 parse
  return rows;
}

/**
 * 執行餐盒的單筆新增操作
 */
export async function insertMealbox(
  merchantId: number,
  product: any
): Promise<number> {
  // 將參數按 SQL 順序排列
  const params = [
    merchantId,
    product.name,
    product.description || null, // 允許空值
    product.original_price,
    product.discount_price,
    product.quantity,
    product.pickup_time_start,
    product.pickup_time_end,
    product.img_url || null,
    1, // is_active
  ];

  console.log("DEBUG insertMealbox - product:", product);
  console.log("DEBUG insertMealbox - params:", params);

  const [result] = await pool.query(INSERT_MEALBOX_SQL, params);
  return (result as any).insertId; // 回傳新增的 ID
}

/**
 * 執行餐盒的單筆更新操作
 */
export async function updateMealbox(
  merchantId: number,
  productId: number,
  product: any
): Promise<number> {
  // 判斷是否是部分更新（只更新img_url）
  if (Object.keys(product).length === 1 && product.img_url !== undefined) {
    // 只更新img_url的情況
    const sql = `UPDATE mealboxes SET img_url = ? WHERE id = ? AND merchant_id = ?;`;
    const params = [product.img_url || null, productId, merchantId];
    const [result] = await pool.query(sql, params);
    return (result as any).affectedRows;
  }

  // 全量更新的情況
  const params = [
    product.name,
    product.description || null,
    product.original_price,
    product.discount_price,
    product.quantity,
    product.pickup_time_start,
    product.pickup_time_end,
    product.img_url || null,
    productId, // WHERE id = ?
    merchantId, // AND merchant_id = ?
  ];

  const [result] = await pool.query(UPDATE_MEALBOX_SQL, params);
  return (result as any).affectedRows; // 回傳影響的行數 (0 或 1)
}

/**
 * 獲取商家的所有餐盒產品
 */
export async function getMealboxesByMerchantId(
  merchantId: number
): Promise<any[]> {
  const sql = `
    SELECT 
      id, merchant_id, name, description, original_price, discount_price,
      quantity, pickup_time_start, pickup_time_end, img_url, is_active,
      created_at, updated_at
    FROM mealboxes
    WHERE merchant_id = ?
    ORDER BY created_at DESC
  `;

  const [rows] = await pool.query<RowDataPacket[]>(sql, [merchantId]);
  return rows;
}
