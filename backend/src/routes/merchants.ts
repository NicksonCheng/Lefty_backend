import { Router, Request, Response } from "express";
import { handleBatchProductInsert } from "../services/mealbox.service";
import { authenticateToken } from "../middleware/auth";
import { setupNewMerchant } from "../services/merchant.service";
import { MerchantData } from "../inerface";
interface AuthRequest extends Request {
  user?: any;
}
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
 * POST /merchants/setup
 * setup merchant
 * Query params:{
 *  user_id: number,
 *  store_name: string,
 *  address: string,
 *  phone: string
 *  lat: number,
 *  lng: number,
 * }
 */
router.post(
  "/setup",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      const { store_name, address, phone, lat, lng } = req.body;

      const setupData: MerchantData = {
        store_name,
        address,
        phone,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
      };

      // 3. 業務處理 (調用 Service 層)
      const result = await setupNewMerchant(userId, userRole, setupData);
      if (!result.success && result.message.includes("Forbidden")) {
        return res.status(403).json(result);
      }

      if (!result.success) {
        return res.status(409).json(result); // 409 Conflict for existing profile
      }
      // successful
      return res.status(201).json(result);
    } catch (error) {
      console.error("Merchant Setup Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal Server Error during merchant setup.",
      });
    }
  }
);
/**
 * POST /merchants/insert
 * merchant insert mealbox
 * Query params:
 * {
  "merchant_id": 101,
  "products": [
    {
      // 新增商品
      "name": "今日剩餘素食餐盒",
      "description": "健康時蔬搭配五穀米，CP值超高！",
      "original_price": 100,
      "discount_price": 50,
      "quantity": 3,
      "pickup_time_start": "19:30",
      "pickup_time_end": "20:30"
    },
    {
      // 更新現有商品 P9876 的數量
      "product_id": 9876,
      "name": "招牌牛肉麵套餐", 
      "original_price": 150,
      "discount_price": 75,
      "quantity": 1, 
      "pickup_time_start": "20:00",
      "pickup_time_end": "20:45",
      "img_url": "http://example.com/beef_noodle.jpg"
    }
  ]
}
 */
// =======================================================
// 1. POST /api/mealboxes - 專門用於新增產品 (INSERT)
// =======================================================
router.post("/mealboxes", async (req: Request, res: Response) => {
  // 注意：這裡假設 req: AuthRequest 已通過 JWT 驗證，並擁有 req.user.merchant_id
  const merchant_id = req.body.merchant_id; // 或者從 JWT payload (req.user) 中獲取
  const products = req.body.products as any[];

  // 基礎驗證
  if (!merchant_id || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid request body. merchant_id and a non-empty products array are required.",
    });
  }

  try {
    // 🌟 核心：只允許執行 INSERT 操作
    const responseData = await handleBatchProductInsert(
      merchant_id,
      products,
      "INSERT" // 傳遞操作類型
    );

    const httpStatus = responseData.success ? 201 : 207; // 201 Created 或 207 Multi-Status
    res.status(httpStatus).json(responseData);
  } catch (error) {
    console.error("POST /mealboxes Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during batch insertion.",
    });
  }
});

// =======================================================
// 2. PUT /api/mealboxes - 專門用於更新產品 (UPDATE)
// =======================================================
router.put("/mealboxes", async (req: Request, res: Response) => {
  const merchant_id = req.body.merchant_id; // 或者從 JWT payload (req.user) 中獲取
  const products = req.body.products as any[];

  // 基礎驗證：更新操作要求每個產品都必須有 product_id
  if (!merchant_id || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid request body. merchant_id and a non-empty products array are required.",
    });
  }
  // 檢查所有產品是否包含 product_id
  const allHaveId = products.every((p) => p.product_id);
  if (!allHaveId) {
    return res.status(400).json({
      success: false,
      message:
        "All products in a PUT batch request must include 'product_id' for update.",
    });
  }

  try {
    // 🌟 核心：只允許執行 UPDATE 操作
    const responseData = await handleBatchProductInsert(
      merchant_id,
      products,
      "UPDATE" // 傳遞操作類型
    );

    const httpStatus = responseData.success ? 200 : 207; // 200 OK 或 207 Multi-Status
    res.status(httpStatus).json(responseData);
  } catch (error) {
    console.error("PUT /mealboxes Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during batch update.",
    });
  }
});
export default router;
