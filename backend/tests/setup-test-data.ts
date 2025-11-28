/**
 * 測試資料生成腳本
 * 在指定經緯度附近生成大量商家和餐盒資料
 *
 * 使用方式：
 * npx ts-node tests/setup-test-data.ts
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// 判斷執行環境：Docker 內使用 'mysql'，本機使用 'localhost'
const isDocker =
  process.env.DB_HOST === "mysql" || process.env.NODE_ENV === "docker";
const dbHost = isDocker ? "mysql" : "localhost";
console.log(`🔌 資料庫連線: ${dbHost}:3306`);
console.log(
  `📊 資料庫名稱: ${process.env.TEST_DB_NAME?.trim() || "Lefty_Test"}`
);
console.log(`👤 資料庫用戶: ${process.env.TEST_DB_USER || "root"}`);

// 建立連線池
const pool = mysql.createPool({
  host: dbHost,
  port: 3306,
  user: process.env.TEST_DB_USER || "root",
  password: process.env.TEST_DB_PASSWORD || "123456",
  database: process.env.TEST_DB_NAME?.trim() || "Lefty_Test",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

interface TestDataConfig {
  centerLat: number;
  centerLng: number;
  merchantCount: number;
  mealboxesPerMerchant: number;
  radiusKm: number; // 商家分布半徑（公里）
}

/**
 * 生成指定範圍內的隨機座標
 * @param centerLat 中心緯度
 * @param centerLng 中心經度
 * @param radiusKm 半徑（公里）
 */
function generateRandomLocation(
  centerLat: number,
  centerLng: number,
  radiusKm: number
) {
  // 1度緯度約等於111公里
  // 1度經度在台灣約等於101公里（cos(24°) * 111）
  const latDegreePerKm = 1 / 111;
  const lngDegreePerKm = 1 / 101;

  // 生成隨機角度和距離
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * radiusKm;

  const deltaLat = distance * Math.cos(angle) * latDegreePerKm;
  const deltaLng = distance * Math.sin(angle) * lngDegreePerKm;

  return {
    lat: centerLat + deltaLat,
    lng: centerLng + deltaLng,
  };
}

/**
 * 生成隨機商家名稱
 */
function generateMerchantName(index: number): string {
  const prefixes = [
    "美味",
    "香濃",
    "傳統",
    "創意",
    "健康",
    "有機",
    "手作",
    "職人",
  ];
  const types = [
    "便當",
    "咖啡",
    "麵包",
    "壽司",
    "拉麵",
    "火鍋",
    "早餐",
    "甜點",
  ];
  const suffixes = ["屋", "店", "坊", "館", "廚房", "工坊", "小舖"];

  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const type = types[Math.floor(Math.random() * types.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];

  return `${prefix}${type}${suffix} #${index}`;
}

/**
 * 生成隨機餐盒名稱
 */
function generateMealboxName(index: number): string {
  const adjectives = [
    "經典",
    "招牌",
    "特選",
    "精緻",
    "豪華",
    "超值",
    "人氣",
    "限量",
  ];
  const items = [
    "雞腿",
    "排骨",
    "魚排",
    "素食",
    "海鮮",
    "牛肉",
    "豬排",
    "鮭魚",
  ];

  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const item = items[Math.floor(Math.random() * items.length)];

  return `${adj}${item}便當 #${index}`;
}

/**
 * 生成隨機取餐時間
 */
function generatePickupTime() {
  const startHour = 11 + Math.floor(Math.random() * 8); // 11-18點
  const endHour = startHour + 1 + Math.floor(Math.random() * 2); // +1到+2小時

  return {
    start: `${startHour.toString().padStart(2, "0")}:00`,
    end: `${endHour.toString().padStart(2, "0")}:00`,
  };
}

/**
 * 插入測試商家資料
 */
async function insertTestMerchants(config: TestDataConfig) {
  console.log(`\n🏪 開始生成 ${config.merchantCount} 個商家...`);
  console.log(`📍 中心位置: (${config.centerLat}, ${config.centerLng})`);
  console.log(`📏 分布半徑: ${config.radiusKm} km`);

  const merchantIds: number[] = [];

  for (let i = 0; i < config.merchantCount; i++) {
    const location = generateRandomLocation(
      config.centerLat,
      config.centerLng,
      config.radiusKm
    );
    const name = generateMerchantName(i + 1);
    const email = `test${i + 1}@merchant.com`;

    // 1. 先建立 user
    const userSql = `
      INSERT INTO users (name, email, password, role)
      VALUES (?, ?, ?, 'merchant')
    `;
    const userParams = [
      name,
      email,
      "$2b$10$testHashForPerformanceTest", // 測試用假 hash
    ];
    const [userResult] = await pool.query(userSql, userParams);
    const userId = (userResult as any).insertId;

    // 2. 再建立 merchant（使用 user_id）
    const merchantSql = `
      INSERT INTO merchants (
        user_id,
        store_name, 
        lat, 
        lng, 
        location,
        address,
        phone
      ) VALUES (?, ?, ?, ?, ST_GeomFromText(CONCAT('POINT(', ?, ' ', ?, ')'), 4326), ?, ?)
    `;
    const merchantParams = [
      userId,
      name,
      location.lat,
      location.lng,
      location.lat,
      location.lng,
      `台北市測試區測試路${i + 1}號`,
      `0912-345-${(i + 1).toString().padStart(3, "0")}`,
    ];
    const [merchantResult] = await pool.query(merchantSql, merchantParams);
    merchantIds.push((merchantResult as any).insertId);

    if ((i + 1) % 100 === 0) {
      console.log(`  ✅ 已生成 ${i + 1}/${config.merchantCount} 個商家`);
    }
  }

  console.log(`✅ 完成商家生成！`);
  return merchantIds;
}

/**
 * 插入測試餐盒資料
 */
async function insertTestMealboxes(
  merchantIds: number[],
  mealboxesPerMerchant: number
) {
  console.log(`\n🍱 開始生成餐盒資料...`);
  console.log(`📊 每個商家 ${mealboxesPerMerchant} 個餐盒`);

  let totalMealboxes = 0;

  for (let i = 0; i < merchantIds.length; i++) {
    const merchantId = merchantIds[i];

    for (let j = 0; j < mealboxesPerMerchant; j++) {
      const name = generateMealboxName(j + 1);
      const pickupTime = generatePickupTime();
      const originalPrice = 100 + Math.floor(Math.random() * 150);
      const discountPrice = Math.floor(
        originalPrice * (0.3 + Math.random() * 0.4)
      ); // 30-70% off
      const quantity = 1 + Math.floor(Math.random() * 10);

      const sql = `
        INSERT INTO mealboxes (
          merchant_id,
          name,
          description,
          original_price,
          discount_price,
          quantity,
          pickup_time_start,
          pickup_time_end,
          img_url,
          is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `;

      const params = [
        merchantId,
        name,
        `測試用餐盒描述 ${j + 1}`,
        originalPrice,
        discountPrice,
        quantity,
        pickupTime.start,
        pickupTime.end,
        `https://picsum.photos/400/300?random=${merchantId}-${j}`,
      ];

      await pool.query(sql, params);
      totalMealboxes++;
    }

    if ((i + 1) % 100 === 0) {
      console.log(
        `  ✅ 已生成 ${(i + 1) * mealboxesPerMerchant}/${
          merchantIds.length * mealboxesPerMerchant
        } 個餐盒`
      );
    }
  }

  console.log(`✅ 完成餐盒生成！總共 ${totalMealboxes} 個餐盒`);
}

/**
 * 清除舊的測試資料
 */
async function cleanupOldTestData() {
  console.log("\n🧹 清除舊的測試資料...");

  // 1. 刪除測試商家的餐盒
  await pool.query(`
    DELETE mb FROM mealboxes mb
    JOIN merchants m ON mb.merchant_id = m.id
    JOIN users u ON m.user_id = u.id
    WHERE u.email LIKE 'test%@merchant.com'
  `);

  // 2. 刪除測試商家
  await pool.query(`
    DELETE m FROM merchants m
    JOIN users u ON m.user_id = u.id
    WHERE u.email LIKE 'test%@merchant.com'
  `);

  // 3. 刪除測試用戶
  const [result] = await pool.query(`
    DELETE FROM users WHERE email LIKE 'test%@merchant.com'
  `);

  console.log(
    `✅ 已清除 ${(result as any).affectedRows} 個測試用戶及其商家、餐盒`
  );
}

/**
 * 主函數
 */
async function main() {
  console.log("=".repeat(60));
  console.log("📊 測試資料生成工具");
  console.log("=".repeat(60));

  // 測試配置 - 台北市中心（台北車站附近）
  // 💡 提示：增加資料量可以更好地展現 Redis 快取優勢
  const config: TestDataConfig = {
    centerLat: 25.0478, // 台北車站
    centerLng: 121.517,
    merchantCount: 5000, // 生成 5000 個商家（展現 Redis 效能優勢）
    mealboxesPerMerchant: 5, // 每個商家 5 個餐盒
    radiusKm: 20, // 分布在 20 公里半徑內
  };

  try {
    // 清除舊資料
    await cleanupOldTestData();

    // 生成新資料
    const merchantIds = await insertTestMerchants(config);
    await insertTestMealboxes(merchantIds, config.mealboxesPerMerchant);

    console.log("\n" + "=".repeat(60));
    console.log("✅ 測試資料生成完成！");
    console.log("=".repeat(60));
    console.log(`📊 統計資料：`);
    console.log(`   - 商家數量: ${config.merchantCount}`);
    console.log(
      `   - 餐盒數量: ${config.merchantCount * config.mealboxesPerMerchant}`
    );
    console.log(`   - 分布範圍: ${config.radiusKm} km`);
    console.log(`   - 中心座標: (${config.centerLat}, ${config.centerLng})`);
    console.log("=".repeat(60));
  } catch (error) {
    console.error("❌ 錯誤:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

// 執行
main().catch(console.error);
