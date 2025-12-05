import { Router, Request, Response } from "express";
import { handleBatchProductInsert } from "../services/mealbox.service";
import { authenticateToken } from "../middleware/auth";
import { setupNewMerchant } from "../services/merchant.service";
import { generatePresignedUploadUrl } from "../services/image.service";
import { MerchantData } from "../interface";
import { getMealboxesByMerchantId } from "../repositories/mealbox.repository";
import { getMerchantByUserId } from "../repositories/merchant.repository";

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
 * GET /merchants/me
 * @summary Get current user's merchant profile
 * @returns {object} 200 - success response with merchant data
 * @returns {object} 404 - merchant not found
 * @returns {object} 500 - internal server error
 */
router.get(
  "/me",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const merchant = await getMerchantByUserId(userId);

      if (!merchant) {
        return res.status(404).json({
          success: false,
          message: "Merchant profile not found",
        });
      }

      res.status(200).json({
        success: true,
        data: merchant,
      });
    } catch (error) {
      console.error("GET /merchants/me Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching merchant profile.",
      });
    }
  }
);

/**
 * POST /merchants/presigned-url
 * @summary Generate presigned URL for frontend image upload to S3
 * @param {object} req.body
 * @param {number} req.body.merchant_id - merchant id
 * @param {number} req.body.mealbox_id - mealbox id (optional, default: 0)
 * @param {string} req.body.file_name - file name for S3 key generation
 * @returns {object} 200 - success response with presignedUrl and s3Key
 * @returns {object} 400 - bad request response
 * @returns {object} 500 - internal server error response
 **/
router.post(
  "/presigned-url",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const merchantId = req.body.merchant_id;
      const mealboxId = req.body.mealbox_id || "0";
      const fileName = req.body.file_name || "image.jpg";

      if (!merchantId) {
        return res.status(400).json({
          success: false,
          message: "merchant_id is required",
        });
      }

      const { presignedUrl, s3Key } = await generatePresignedUploadUrl(
        merchantId.toString(),
        mealboxId.toString(),
        fileName
      );

      res.status(200).json({
        success: true,
        presignedUrl,
        s3Key,
      });
    } catch (error) {
      console.error("POST /presigned-url Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while generating presigned URL",
      });
    }
  }
);

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
 * POST /merchants/mealboxes
 * @summary merchant insert mealbox with image URLs
 * @param {object} req.body
 * @param {number} req.body.merchant_id - merchant id
 * @param {array} req.body.products - array of products to insert
 * @param {string} req.body.products[].name - product name
 * @param {string} req.body.products[].description - product description
 * @param {number} req.body.products[].original_price - product original price
 * @param {number} req.body.products[].discount_price - product discount price
 * @param {number} req.body.products[].quantity - product quantity
 * @param {string} req.body.products[].pickup_time_start - product pickup time start
 * @param {string} req.body.products[].pickup_time_end - product pickup time end
 * @param {string} req.body.products[].img_url - product image URL (uploaded to S3 by frontend)
 *
 * @returns {object} 201 - success response
 * @returns {object} 400 - bad request response
 * @returns {object} 500 - internal server error response
 **/
router.post(
  "/mealboxes",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    const merchant_id = req.body.merchant_id;
    const products = req.body.products;

    // 基礎驗證
    if (!merchant_id || !products) {
      return res.status(400).json({
        success: false,
        message: "merchant_id and products array are required.",
      });
    }

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "products must be a non-empty array.",
      });
    }

    try {
      // 調用 Service 層，不需要傳遞上傳的檔案
      const responseData = await handleBatchProductInsert(
        parseInt(merchant_id as string),
        products,
        "INSERT",
        [] // 空檔案陣列，因為圖片已由前端上傳到 S3
      );

      const httpStatus = responseData.success ? 201 : 207;
      res.status(httpStatus).json(responseData);
    } catch (error) {
      console.error("POST /mealboxes Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during batch insertion.",
      });
    }
  }
);

/**
 * PUT /merchants/mealboxes
 * @summary merchant update mealbox
 * @param {object} req.body
 * @param {number} req.body.merchant_id - merchant id
 * @param {array} req.body.products - array of products to update (each must include product_id)
 * @param {string} req.body.products[].name - product name
 * @param {string} req.body.products[].description - product description
 * @param {number} req.body.products[].original_price - product original price
 * @param {number} req.body.products[].discount_price - product discount price
 * @param {number} req.body.products[].quantity - product quantity
 * @param {string} req.body.products[].pickup_time_start - product pickup time start
 * @param {string} req.body.products[].pickup_time_end - product pickup time end
 * @param {string} req.body.products[].img_url - product image URL
 * @returns {object} 200 - success response
 * @returns {object} 400 - bad request response
 * @returns {object} 500 - internal server error response
 **/
router.put(
  "/mealboxes",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    const merchant_id = req.body.merchant_id;
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
  }
);
/**
 * GET /merchants/mealboxes/:merchantId
 * @summary Get all mealboxes for a merchant
 * @param {number} merchantId - merchant id
 * @returns {object} 200 - success response with mealboxes array
 * @returns {object} 500 - internal server error response
 **/
router.get(
  "/mealboxes/:merchantId",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const merchantId = parseInt(req.params.merchantId);

      if (isNaN(merchantId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid merchant ID",
        });
      }

      const mealboxes = await getMealboxesByMerchantId(merchantId);

      res.status(200).json({
        success: true,
        data: mealboxes,
      });
    } catch (error) {
      console.error("GET /mealboxes/:merchantId Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching mealboxes.",
      });
    }
  }
);

export default router;
