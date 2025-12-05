// src/services/mealbox.service.ts

// ... (其他匯入) ...
import {
  insertMealbox,
  updateMealbox,
} from "../repositories/mealbox.repository";
import { findNearbyMerchants } from "../repositories/mealbox.repository";
import { redis } from "../utils/upstashRedis";
import { uploadImageToS3 } from "./image.service";

// 定義回傳給 Controller 的結果類型
interface ProductResult {
  submitted_name: string;
  action: "INSERT" | "UPDATE";
  product_id: number | null;
  status: "SUCCESS" | "FAILURE";
  error_reason?: string;
  image_url?: string; // 新增：上傳的圖片 URL
}

function validateProduct(product: any): string | null {
  if (!product.name) return "Product name is required.";
  if (product.quantity < 1) return "Stock quantity must be at least 1.";
  if (product.discount_price > product.original_price) {
    return "Discount price cannot be higher than original price.";
  }
  // 可以在此加入時間格式 HH:mm 檢查
  return null; // 驗證通過
}

/**
 * 定義操作類型
 */
type OperationType = "INSERT" | "UPDATE";

/**
 * 處理商家上傳的批次商品列表（支援圖片上傳）
 *
 * @param merchantId - 商家 ID
 * @param products - 商品陣列，若包含 image_index，將上傳對應索引的圖片到 S3
 * @param operationType - 操作類型："INSERT" 或 "UPDATE"
 * @param uploadedFiles - 上傳的圖片檔案陣列（來自 multer）
 *
 * 預期格式：
 * - product.image_index (number，選填)：對應 uploadedFiles 陣列的索引
 * - uploadedFiles[i].buffer：圖片二進制數據
 * - uploadedFiles[i].originalname：原始檔名
 */
export async function handleBatchProductInsert(
  merchantId: number,
  products: any[],
  operationType: OperationType,
  uploadedFiles?: Express.Multer.File[]
): Promise<{ success: boolean; message: string; results: ProductResult[] }> {
  const results: ProductResult[] = [];
  let successCount = 0;
  const files = uploadedFiles || [];

  for (const product of products) {
    const validationError = validateProduct(product);
    if (validationError) {
      results.push({
        submitted_name: product.name,
        action: operationType,
        product_id: product.product_id || null,
        status: "FAILURE",
        error_reason: validationError,
      });
      continue;
    }

    // 根據 operationType 執行對應的邏輯
    try {
      if (operationType === "UPDATE") {
        // --- 專門處理 UPDATE (必須有 product_id) ---
        if (!product.product_id) {
          // 在 PUT 路由中，如果缺少 product_id，則視為不合法
          results.push({
            submitted_name: product.name,
            action: "UPDATE",
            product_id: null,
            status: "FAILURE",
            error_reason: "Product ID is required for update operation.",
          });
          continue;
        }

        const affectedRows = await updateMealbox(
          merchantId,
          product.product_id,
          product
        );

        results.push({
          submitted_name: product.name,
          action: "UPDATE",
          product_id: product.product_id,
          status: affectedRows > 0 ? "SUCCESS" : "FAILURE",
          error_reason:
            affectedRows === 0
              ? "Product not found or not owned by merchant."
              : undefined,
        });
        if (affectedRows > 0) successCount++;
      } else if (operationType === "INSERT") {
        // --- 專門處理 INSERT ---
        if (product.product_id) {
          // 在 POST 路由中，如果誤傳 product_id，則可能被視為錯誤或直接忽略
          console.warn(
            `Ignoring product_id for POST INSERT operation: ${product.product_id}`
          );
        }

        // 【新增】如果有圖片索引且提供了檔案，進行上傳
        let imageUrl: string | undefined;
        if (
          product.image_index !== undefined &&
          product.image_index >= 0 &&
          product.image_index < files.length
        ) {
          try {
            console.log(
              `DEBUG: Processing product with image - index ${product.image_index}, product:`,
              JSON.stringify(product)
            );
            const file = files[product.image_index];
            // 先執行資料庫插入取得 product_id
            const newId = await insertMealbox(merchantId, product);
            console.log(`DEBUG: Inserted product ID: ${newId}`);

            // 再上傳圖片，使用新的 product_id 作為 mealbox_id
            const uploadResult = await uploadImageToS3(
              file.buffer,
              merchantId.toString(),
              newId.toString(),
              file.originalname
            );
            console.log(`DEBUG: Upload result:`, uploadResult);

            imageUrl = uploadResult.imageUrl;
            // 更新商品記錄以儲存圖片 URL
            await updateMealbox(merchantId, newId, { img_url: imageUrl });

            results.push({
              submitted_name: product.name,
              action: "INSERT",
              product_id: newId,
              status: "SUCCESS",
              image_url: imageUrl, // 包含圖片 URL 在結果中
            });
            successCount++;
          } catch (imageError) {
            console.error(
              `Failed to process product with image ${product.name}: ${
                (imageError as Error).message
              }`,
              imageError
            );
            results.push({
              submitted_name: product.name,
              action: "INSERT",
              product_id: null,
              status: "FAILURE",
              error_reason: `Product insertion with image upload failed: ${
                (imageError as Error).message
              }`,
            });
          }
        } else {
          // 沒有圖片或索引無效，直接插入
          try {
            const newId = await insertMealbox(merchantId, product);
            results.push({
              submitted_name: product.name,
              action: "INSERT",
              product_id: newId,
              status: "SUCCESS",
            });
            successCount++;
          } catch (dbError) {
            results.push({
              submitted_name: product.name,
              action: "INSERT",
              product_id: null,
              status: "FAILURE",
              error_reason: `Database error: ${(dbError as Error).message}`,
            });
          }
        }
      }
    } catch (dbError) {
      // 捕獲資料庫層級的錯誤
      results.push({
        submitted_name: product.name,
        action: operationType,
        product_id: product.product_id || null,
        status: "FAILURE",
        error_reason: `Database error: ${(dbError as Error).message}`,
      });
    }
  }

  const overallSuccess = successCount === products.length;
  const verb = operationType === "INSERT" ? "insertion" : "update";
  const message = overallSuccess
    ? `Successfully processed ${successCount} out of ${products.length} products for batch ${verb}.`
    : `Processed ${products.length} products with ${successCount} successful ${verb} operations.`;

  return { success: overallSuccess, message, results };
}

// 業務邏輯，例如：Cache 處理、資料驗證、複雜計算
export async function getNearbyData(
  lat: number,
  lng: number,
  radius: number,
  limit: number
) {
  const cacheKey = `nearby:${lat}:${lng}:${radius}:${limit}`;

  // 檢查 Cache (業務邏輯)
  const cached = await redis.get(cacheKey);
  if (cached) {
    // Upstash Redis 會自動解析 JSON，不需要 JSON.parse()
    return { data: cached, source: "redis" };
  }

  // 調用 Repository 層獲取資料 (資料庫操作)
  const data = await findNearbyMerchants(lat, lng, radius, limit);

  // 設定 Cache (業務邏輯)
  // Upstash Redis 會自動序列化 JSON，不需要 JSON.stringify()
  await redis.set(cacheKey, data, { ex: 30 });

  return { data, source: "mysql" };
}
