// src/services/mealbox.service.ts

// ... (其他匯入) ...
import {
  insertMealbox,
  updateMealbox,
} from "../repositories/mealbox.repository";

// 定義回傳給 Controller 的結果類型
interface ProductResult {
  submitted_name: string;
  action: "INSERT" | "UPDATE";
  product_id: number | null;
  status: "SUCCESS" | "FAILURE";
  error_reason?: string;
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
 * 處理商家上傳的批次商品列表
 */
export async function handleBatchProductInsert(
  merchantId: number,
  products: any[],
  operationType: OperationType // <-- 新增此參數
): Promise<{ success: boolean; message: string; results: ProductResult[] }> {
  const results: ProductResult[] = [];
  let successCount = 0;

  for (const product of products) {
    const validationError = validateProduct(product);
    if (validationError) {
      results.push({
        submitted_name: product.name,
        action: operationType, // 使用當前操作類型
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

        const newId = await insertMealbox(merchantId, product);
        results.push({
          submitted_name: product.name,
          action: "INSERT",
          product_id: newId,
          status: "SUCCESS",
        });
        successCount++;
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
