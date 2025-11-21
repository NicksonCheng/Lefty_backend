import { Router, Request, Response } from "express";
import pool from "../db";
import { RowDataPacket } from "mysql2";
import { authenticateToken } from "../middleware/auth";
import { redis } from "../utils/upstashRedis";
import { MealBox, User } from "../inerface";
import { findNearbyMerchants } from "../repositories/mealbox.repository";
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
/**
 * GET /nearby
 * Search nearby mealbox from users location
 * Query params:
 * - lat (required): User latitude
 * - lng (required): User longitude
 * - radius (required): Search radius in kilometers
 * - limit (optional): Max merchants to return (default: 10)
 * Returns: List of nearby merchants with mealboxes
 * {
      "merchant_id": 101,
      "store_name": "大安區健康便當",
      "distance_meters": 350,  // 計算出的距離
      "lat": 25.0330,
      "lng": 121.5645,
      "avatar_url": "http://.../logo.jpg",
      "mealboxes": [
        {
          "id": 501,
          "name": "香煎雞腿排餐盒 (剩餘)",
          "original_price": 150,
          "discount_price": 80,
          "quantity": 3,
          "pickup_time": "20:00-21:00",
          "img_url": "http://.../food1.jpg"
        },
        {
          "id": 502,
          "name": "鯖魚便當",
          "original_price": 130,
          "discount_price": 70,
          "quantity": 1,
          "pickup_time": "20:00-21:00",
          "img_url": "http://.../food2.jpg"
        }
      ]
    },
 */
router.get("/nearby", async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    // 🌟 radius 預設為 3000 (米)
    const radius = parseInt((req.query.radius as string) || "3000");
    const limit = parseInt((req.query.limit as string) || "10");

    if (!lat || !lng) {
      return res.status(400).json({ error: "lat & lng required" });
    }
    const cacheKey = generateCacheKey(lat, lng);
    const startTime = Date.now();
    // ==== 1. search Redis ====
    const cached: string | null = await redis.get(cacheKey);
    if (cached) {
      console.log(`Redis HIT! ${Date.now() - startTime}ms`);
      return res.status(200).json({
        data: JSON.parse(cached),
        source: "redis",
        timeMs: Date.now() - startTime,
      });
    }
    // ==== 2. search MySQL ====
    const data = await findNearbyMerchants(lat, lng, radius, limit);
    // save the result to redis
    await redis.set(cacheKey, JSON.stringify(data), { ex: 30 }); // cache 30 seconds
    console.log(`Redis MISS! ${Date.now() - startTime}ms`);

    // response
    res.status(200).json({
      data: data,
      source: "mysql",
      timeMs: Date.now() - startTime,
    });
  } catch (error) {}
});
export default router;
