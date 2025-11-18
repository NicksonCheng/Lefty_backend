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
router.get("/", async (req: Request, res: Response) => {
  try {
    const { lat, lng, radius, category, limit } = req.query;

    // Validate required parameters
    if (!lat || !lng || !radius) {
      return res.status(400).json({
        error: "lat, lng, and radius are required",
      });
    }

    const latitude = parseFloat(lat as string);
    const longitude = parseFloat(lng as string);
    const radiusInMeters = parseFloat(radius as string) * 1000; // Convert km to meters
    const limitNum = limit ? parseInt(limit as string) : 10;
    const categoryFilter = category ? String(category) : undefined;

    // Build geospatial + optional category filter
    const filter: any = {
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          $maxDistance: radiusInMeters,
        },
      },
    };

    if (categoryFilter) {
      filter.category = categoryFilter;
    }

    // Use Mongoose model to run query
    const merchants = await Merchant.find(filter).limit(limitNum).lean().exec();

    res.status(200).json({
      count: merchants.length,
      merchants,
    });
  } catch (error) {
    console.error("Merchants search error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
