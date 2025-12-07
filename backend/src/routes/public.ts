/**
 * routes/public.ts — 公開路由（不需要登入）
 */
import { Router, Request, Response } from "express";
import { getNearbyData } from "../services/mealbox.service";
import { redisManager } from "../utils/redisClientManager";

const router = Router();

/**
 * GET /nearby
 * 查詢附近商家與剩食資訊 — 公開端點，不需要 JWT
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

    const { data, source } = await getNearbyData(lat, lng, radius, limit);

    console.log(
      `${source} ${source === "redis" ? "HIT" : "MISS"}! ${
        Date.now() - startTime
      }ms`,
    );

    res.status(200).json({
      success: true,
      data,
      source,
      timeMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

/**
 * GET /health/redis
 * Redis circuit-breaker 狀態 — 供 CD smoke test 使用
 */
router.get("/health/redis", (_req: Request, res: Response) => {
  const state = redisManager.getCircuitState();
  res.status(200).json(state);
});

export default router;
