/**
 * 清除測試資料腳本
 *
 * 使用方式：
 * npx ts-node tests/cleanup-test-data.ts
 * 或在 Docker 中:
 * docker compose run --rm test npm run test:cleanup
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// 判斷執行環境
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

/**
 * 清除測試資料
 */
async function cleanupTestData() {
  console.log("\n" + "=".repeat(60));
  console.log("🧹 清除測試資料");
  console.log("=".repeat(60));

  try {
    // 1. 刪除測試商家的餐盒
    console.log("\n📦 刪除測試餐盒...");
    const [mealboxResult] = await pool.query(`
      DELETE mb FROM mealboxes mb
      JOIN merchants m ON mb.merchant_id = m.id
      JOIN users u ON m.user_id = u.id
      WHERE u.email LIKE 'test%@merchant.com'
    `);
    console.log(`✅ 已刪除 ${(mealboxResult as any).affectedRows} 個餐盒`);

    // 2. 刪除測試商家
    console.log("\n🏪 刪除測試商家...");
    const [merchantResult] = await pool.query(`
      DELETE m FROM merchants m
      JOIN users u ON m.user_id = u.id
      WHERE u.email LIKE 'test%@merchant.com'
    `);
    console.log(`✅ 已刪除 ${(merchantResult as any).affectedRows} 個商家`);

    // 3. 刪除測試用戶
    console.log("\n👤 刪除測試用戶...");
    const [userResult] = await pool.query(`
      DELETE FROM users WHERE email LIKE 'test%@merchant.com'
    `);
    console.log(`✅ 已刪除 ${(userResult as any).affectedRows} 個用戶`);

    console.log("\n" + "=".repeat(60));
    console.log("✅ 測試資料清除完成！");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("❌ 清除失敗:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

// 執行
cleanupTestData().catch(console.error);
