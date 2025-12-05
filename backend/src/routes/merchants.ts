import { Router, Request, Response } from "express";
import multer from "multer";
import { handleBatchProductInsert } from "../services/mealbox.service";
import { authenticateToken } from "../middleware/auth";
import { setupNewMerchant } from "../services/merchant.service";
import { generateSignedUrlForImage } from "../services/image.service";
import { MerchantData } from "../interface";
import { getMealboxesByMerchantId } from "../repositories/mealbox.repository";
import { getMerchantByUserId } from "../repositories/merchant.repository";

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max per file
    fieldSize: 50 * 1024 * 1024, // 50MB max for field data (products JSON)
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

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
 * POST /merchants/setup
 * @summary create new merchants profile
 * @param {object} req.body
 * @param {number} req.body.user_id - user id
 * @param {string} req.body.store_name - store name
 * @param {string} req.body.address - store address
 * @param {string} req.body.phone - store phone
 * @param {number} req.body.lat - store latitude
 * @param {number} req.body.lng - store longitude
 * @returns {object} 201 - success response
 * @returns {object} 403 - forbidden response
 * @returns {object} 409 - conflict response
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
 * POST /merchants/mealboxes
 * @summary merchant insert mealbox with image upload
 * @param {object} req.body
 * @param {number} req.body.merchant_id - merchant id
 * @param {string} req.body.products - JSON string of products array
 * @param {array} req.files - image files for products (field name: images)
 *
 * Products array format:
 * [
 *   {
 *     "name": "product name",
 *     "description": "product description",
 *     "original_price": 100,
 *     "discount_price": 80,
 *     "quantity": 10,
 *     "pickup_time_start": "10:00",
 *     "pickup_time_end": "18:00",
 *     "image_index": 0  // index of corresponding image file
 *   }
 * ]
 *
 * @returns {object} 201 - success response
 * @returns {object} 400 - bad request response
 * @returns {object} 500 - internal server error response
 **/
router.post(
  "/mealboxes",
  authenticateToken,
  upload.array("images", 50), // Accept up to 50 images
  async (req: AuthRequest, res: Response) => {
    // merchant_id 可能在 body 或 query string 中
    const merchant_id = req.body.merchant_id;
    const productsJson = req.body.products;
    const uploadedFiles = (req.files as Express.Multer.File[]) || [];

    console.log("==== POST /merchants/mealboxes ====");
    console.log("req.body keys:", Object.keys(req.body));
    console.log("merchant_id:", merchant_id);
    console.log("productsJson type:", typeof productsJson);
    console.log(
      "productsJson:",
      productsJson ? productsJson.substring(0, 100) : "undefined"
    );
    console.log("uploadedFiles count:", uploadedFiles.length);

    // 基礎驗證
    if (!merchant_id || !productsJson) {
      return res.status(400).json({
        success: false,
        message:
          "merchant_id and products JSON are required. merchant_id can be in body or query string.",
      });
    }

    try {
      // Parse products JSON string
      const products = JSON.parse(productsJson);
      console.log("Parsed products:", products);
      if (!Array.isArray(products) || products.length === 0) {
        return res.status(400).json({
          success: false,
          message: "products must be a non-empty array.",
        });
      }

      // 調用 Service 層，傳遞上傳的檔案
      const responseData = await handleBatchProductInsert(
        parseInt(merchant_id as string),
        products,
        "INSERT",
        uploadedFiles // 新增：傳遞上傳的檔案
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

/**
 * GET /merchants/image-url/:s3Key
 * @summary Generate signed URL for image access
 * @param {string} req.params.s3Key - S3 key of the image
 * @param {number} req.query.expiresIn - Optional: URL expiration time in seconds (default: 86400 = 24 hours)
 *
 * @returns {object} 200 - success response with signed URL
 * @returns {object} 400 - bad request response
 * @returns {object} 500 - internal server error response
 **/
router.get(
  "/image-url/:encodedS3Key",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      // Decode the S3 key (it's URL encoded in the route)
      const s3Key = decodeURIComponent(req.params.encodedS3Key);
      const expiresIn = parseInt(req.query.expiresIn as string) || 86400; // Default 24 hours

      if (!s3Key) {
        return res.status(400).json({
          success: false,
          message: "s3Key is required",
        });
      }

      const signedUrl = await generateSignedUrlForImage(s3Key, expiresIn);

      res.status(200).json({
        success: true,
        signedUrl,
        expiresIn,
      });
    } catch (error) {
      console.error("GET /image-url Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while generating signed URL.",
      });
    }
  }
);

export default router;
