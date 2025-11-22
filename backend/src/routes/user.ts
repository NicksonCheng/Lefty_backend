import { Router, Request, Response } from "express";
import pool from "../db";
import { RowDataPacket } from "mysql2";
import { authenticateToken } from "../middleware/auth";
import { getNearbyData } from "../services/mealbox.service";
import { MealBox, User } from "../interface";

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

      const userData = {
        id: users[0].id,
        email: users[0].email,
        name: users[0].name,
        role: users[0].role,
      };

      // If user is merchant, get merchant_id
      if (users[0].role === 'merchant') {
        const [merchants] = await pool.query<RowDataPacket[]>(
          "SELECT id FROM merchants WHERE user_id = ?",
          [users[0].id]
        );
        if (merchants.length > 0) {
          (userData as any).merchant_id = merchants[0].id;
        }
      }

      res.status(200).json(userData);
    } catch (error) {
      console.error("Profile error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);
/**
 * GET /nearby
 * @summary Search nearby mealbox from users location
 * @param {number} req.query.lat - User latitude
 * @param {number} req.query.lng - User longitude
 * @param {number} req.query.radius - Search radius in meters (default: 3000)
 * @param {number} req.query.limit - Max merchants to return (default: 10)
 * @returns {object} 200 - success response
 * @returns {object} 400 - bad request response
 * @returns {object} 500 - internal server error response
 * 
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
    const startTime = Date.now();
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radius = parseInt((req.query.radius as string) || "3000");
    const limit = parseInt((req.query.limit as string) || "50");

    if (!lat || !lng) {
      return res
        .status(400)
        .json({ success: false, error: "lat & lng required" });
    }

    // 🌟 只需要調用 Service 層，完全沒有 SQL 程式碼
    const { data, source } = await getNearbyData(lat, lng, radius, limit);

    console.log(
      `${source} ${source === "redis" ? "HIT" : "MISS"}! ${
        Date.now() - startTime
      }ms`
    );

    res.status(200).json({
      success: true,
      data: data,
      source: source,
      timeMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});
export default router;
