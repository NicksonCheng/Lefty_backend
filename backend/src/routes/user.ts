import { Router, Request, Response } from "express";
import pool from "../db";
import { RowDataPacket } from "mysql2";
import { authenticateToken } from "../middleware/auth";
import { redis } from "../utils/upstashRedis";
import { MealBox, User } from "../inerface";
const router = Router();

// Custom Request interface with user data
interface AuthRequest extends Request {
  user?: any;
}
// generate cache key（以 0.01 度 ≈ 1km 為一格）
const generateCacheKey = (lat: number, lng: number, radiusKm = 3) => {
  const latKey = Math.round(lat * 100) / 100; // 保留到 0.01
  const lngKey = Math.round(lng * 100) / 100;
  return `nearby:${latKey}:${lngKey}:${radiusKm}km`;
};
/**
 * GET /user/profile
 * Get current user's profile information
 * Requires: Authentication token
 */
router.get(
  "/profile",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const [users] = await pool.query<User[]>(
        "SELECT * FROM users WHERE id = ?",
        [req.user.id]
      );

      if (users.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      res.status(200).json({
        email: users[0].email,
        name: users[0].name,
      });
    } catch (error) {
      console.error("Profile error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get("/nearby", async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    // 🌟 radius 預設為 3000 (米)
    const radius = parseInt((req.query.radius as string) || "3000");

    if (!lat || !lng) {
      return res.status(400).json({ error: "lat & lng required" });
    }
    const cacheKey = generateCacheKey(lat, lng);
    const startTime = Date.now();
    // ==== 1. 先查 Redis ====
    const cached: string | null = await redis.get(cacheKey);
    if (cached) {
      console.log(`Redis HIT! ${Date.now() - startTime}ms`);
      return res.status(200).json({
        data: JSON.parse(cached),
        source: "redis",
        timeMs: Date.now() - startTime,
      });
    }
    // search redis cache
    const sql = `
      SELECT 
        id, store_name, title, description,
        original_price, discount_price, quantity,
        lat, lng, pickup_until,
        -- 🌟 計算距離，結果為米
        ST_Distance_Sphere(location, POINT(?, ?)) AS distance_m,
        -- 轉為 km 以便前端顯示
        ROUND(ST_Distance_Sphere(location, POINT(?, ?)) / 1000, 2) AS distance_km
      FROM mealbox
      WHERE 
        available = 1
        AND quantity > 0
        AND pickup_until > NOW()
        -- 🌟 WHERE 條件使用空間索引 (高效)
        AND ST_Distance_Sphere(location, POINT(?, ?)) <= ?
      ORDER BY 
        distance_m ASC -- 根據米的距離排序
      LIMIT 50;
    `;

    // 注意：MySQL POINT 函數是 POINT(lng, lat)
    const [rows] = await pool.query<RowDataPacket[]>(sql, [
      lng,
      lat, // 第一次計算 distance_m/km 用
      lng,
      lat, // 第二次計算 distance_m/km 用 (確保 ROUND 得到的值相同)
      lng,
      lat,
      radius, // 第三次和第四次用於 WHERE 條件，radius 以**米**傳入
    ]);
    // save the result to redis
    await redis.set(cacheKey, JSON.stringify(rows), { ex: 30 }); // cache 30 seconds
    console.log(`Redis MISS! ${Date.now() - startTime}ms`);
    res.status(200).json({
      data: rows,
      source: "mysql",
      timeMs: Date.now() - startTime,
    });
  } catch (error) {}
});
export default router;
