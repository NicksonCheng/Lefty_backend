/**
 * Redis 效能測試
 * 比較有/無 Redis 快取的查詢速度差異
 *
 * 使用方式：
 * npx ts-node tests/redis-performance-test.ts
 */

import mysql from "mysql2/promise";
import { redisManager as redis } from "../src/utils/redisClientManager";
import dotenv from "dotenv";

dotenv.config();

// 判斷執行環境
const isDocker =
  process.env.DB_HOST === "mysql" || process.env.NODE_ENV === "docker";
const dbHost = isDocker ? "mysql" : "localhost";

console.log(`🔌 資料庫連線: ${dbHost}:3306`);
console.log(
  `📊 資料庫名稱: ${process.env.TEST_DB_NAME?.trim() || "Lefty_Test"}`,
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

interface PerformanceResult {
  radius: number;
  withoutRedis: {
    firstQuery: number;
    secondQuery: number;
    avgQuery: number;
    resultCount: number;
  };
  withRedis: {
    firstQuery: number;
    cachedQuery: number;
    speedup: number;
    resultCount: number;
  };
}

/**
 * 直接從資料庫查詢（不使用 Redis）
 */
async function queryWithoutRedis(
  lat: number,
  lng: number,
  radius: number,
  limit: number = 200, // 增加到 200 筆以展現 Redis 優勢
) {
  const sql = `
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

  const params = [lat, lng, lat, lng, radius, limit];
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * 使用 Redis 快取的查詢
 */
async function queryWithRedis(
  lat: number,
  lng: number,
  radius: number,
  limit: number = 200, // 增加到 200 筆以展現 Redis 優勢
) {
  const cacheKey = `nearby:${lat}:${lng}:${radius}:${limit}`;

  // 檢查快取
  const cached = await redis.get(cacheKey);
  if (cached) {
    return cached;
  }

  // 查詢資料庫
  const results = await queryWithoutRedis(lat, lng, radius, limit);

  // 儲存到快取（30秒）
  await redis.set(cacheKey, results, { ex: 30 });

  return results;
}

/**
 * 清除 Redis 快取
 */
async function clearRedisCache(
  lat: number,
  lng: number,
  radius: number,
  limit: number = 50,
) {
  const cacheKey = `nearby:${lat}:${lng}:${radius}:${limit}`;
  await redis.del(cacheKey);
}

/**
 * 執行效能測試
 */
async function runPerformanceTest(
  lat: number,
  lng: number,
  radius: number,
  rounds: number = 3,
): Promise<PerformanceResult> {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 測試範圍: ${radius / 1000} km (${radius} m)`);
  console.log(`📍 座標: (${lat}, ${lng})`);
  console.log(`🔄 測試輪數: ${rounds} 次`);
  console.log(`${"=".repeat(80)}`);

  // 1. 測試無 Redis（多次查詢平均）
  console.log("\n🔍 測試 1: 無 Redis 快取 (直接查詢資料庫)");
  const dbTimes: number[] = [];
  let dbResultCount = 0;

  for (let i = 0; i < rounds; i++) {
    const start = Date.now();
    const results = await queryWithoutRedis(lat, lng, radius);
    const duration = Date.now() - start;
    dbTimes.push(duration);
    dbResultCount = (results as any[]).length;
    console.log(`   第 ${i + 1} 次: ${duration} ms (${dbResultCount} 筆結果)`);
  }

  const avgDbTime = dbTimes.reduce((a, b) => a + b, 0) / dbTimes.length;

  // 2. 測試有 Redis
  console.log("\n🔍 測試 2: 有 Redis 快取");

  // 清除舊快取
  await clearRedisCache(lat, lng, radius);

  // 第一次查詢（寫入快取）
  console.log("   第 1 次查詢 (寫入快取):");
  const redisFirstStart = Date.now();
  const redisFirstResult = await queryWithRedis(lat, lng, radius);
  const redisFirstTime = Date.now() - redisFirstStart;
  console.log(
    `      耗時: ${redisFirstTime} ms (${
      (redisFirstResult as any[]).length
    } 筆結果)`,
  );

  // 第二次查詢（讀取快取）
  console.log("   第 2 次查詢 (讀取快取):");
  const redisCachedStart = Date.now();
  const redisCachedResult = await queryWithRedis(lat, lng, radius);
  const redisCachedTime = Date.now() - redisCachedStart;
  console.log(
    `      耗時: ${redisCachedTime} ms (${
      (redisCachedResult as any[]).length
    } 筆結果)`,
  );

  // 計算加速比
  const speedup = avgDbTime / redisCachedTime;

  // 清除快取
  await clearRedisCache(lat, lng, radius);

  return {
    radius,
    withoutRedis: {
      firstQuery: dbTimes[0],
      secondQuery: dbTimes[1] || dbTimes[0],
      avgQuery: avgDbTime,
      resultCount: dbResultCount,
    },
    withRedis: {
      firstQuery: redisFirstTime,
      cachedQuery: redisCachedTime,
      speedup,
      resultCount: (redisFirstResult as any[]).length,
    },
  };
}

/**
 * 顯示測試結果摘要
 */
function displaySummary(results: PerformanceResult[]) {
  console.log("\n" + "=".repeat(80));
  console.log("📈 效能測試結果摘要");
  console.log("=".repeat(80));
  console.log("\n");

  // 表頭
  console.log(
    "範圍(km) | 資料量 | 無快取(ms) | 有快取-首次(ms) | 有快取-快取(ms) | 加速倍數",
  );
  console.log("-".repeat(80));

  // 數據行
  results.forEach((r) => {
    const radiusKm = (r.radius / 1000).toFixed(1);
    const count = r.withoutRedis.resultCount.toString().padStart(6);
    const noCache = r.withoutRedis.avgQuery.toFixed(1).padStart(10);
    const firstCache = r.withRedis.firstQuery.toFixed(1).padStart(15);
    const cached = r.withRedis.cachedQuery.toFixed(1).padStart(15);
    const speedup = r.withRedis.speedup.toFixed(2).padStart(8) + "x";

    console.log(
      `${radiusKm.padStart(
        8,
      )} | ${count} | ${noCache} | ${firstCache} | ${cached} | ${speedup}`,
    );
  });

  console.log("-".repeat(80));
  console.log("\n💡 結論:");
  results.forEach((r) => {
    console.log(
      `   - ${(r.radius / 1000).toFixed(
        1,
      )}km 範圍: Redis 快取加速 ${r.withRedis.speedup.toFixed(2)}x (${
        r.withoutRedis.resultCount
      } 筆資料)`,
    );
  });

  // 找出最大加速比
  const maxSpeedup = Math.max(...results.map((r) => r.withRedis.speedup));
  const maxSpeedupResult = results.find(
    (r) => r.withRedis.speedup === maxSpeedup,
  );
  console.log(
    `\n🏆 最佳加速效果: ${(maxSpeedupResult!.radius / 1000).toFixed(
      1,
    )}km 範圍，加速 ${maxSpeedup.toFixed(2)} 倍`,
  );
}

/**
 * 主函數
 */
async function main() {
  console.log("=".repeat(80));
  console.log("🚀 Redis 效能測試工具");
  console.log("=".repeat(80));

  // 測試中心點（台北車站）
  const testLat = 25.0478;
  const testLng = 121.517;

  // 測試不同範圍（更大範圍以展現 Redis 優勢）
  const testRadii = [
    3000, // 3 km
    5000, // 5 km
    10000, // 10 km
    15000, // 15 km
    20000, // 20 km
  ];

  const results: PerformanceResult[] = [];

  try {
    for (const radius of testRadii) {
      const result = await runPerformanceTest(testLat, testLng, radius, 3);
      results.push(result);

      // 等待一下，避免過度查詢
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // 顯示摘要
    displaySummary(results);

    console.log("\n" + "=".repeat(80));
    console.log("✅ 測試完成！");
    console.log("=".repeat(80));
  } catch (error) {
    console.error("❌ 測試錯誤:", error);
    throw error;
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// 執行
main().catch(console.error);
