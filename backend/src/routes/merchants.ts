import { Router, Request, Response } from "express";
import Merchant from "../models/merchant";

const router = Router();

/**
 * GET /merchants
 * Search merchants by location with optional category filter
 * Query params:
 *   - lat (required): User latitude
 *   - lng (required): User longitude
 *   - radius (required): Search radius in kilometers
 *   - category (optional): Product category filter
 *   - limit (optional): Max merchants to return (default: 10)
 */
router.get("/", async (req: Request, res: Response) => {});
/**
 * POST /merchants/insert
 * merchant insert mealbox
 * Query params:

 */
router.post("/insert", async (req: Request, res: Response) => {
  try {
  } catch (error) {}
});
export default router;
