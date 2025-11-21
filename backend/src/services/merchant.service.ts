import { isSet } from "util/types";
import {
  checkExistingMerchant,
  insertNewMerchant,
} from "../repositories/merchant.repository";
import { MerchantData } from "../inerface";
export async function setupNewMerchant(
  userId: number,
  userRole: string,
  data: MerchantData
): Promise<{ success: boolean; message: string; merchant_id?: number }> {
  // check role is merchant or not
  if (userRole !== "merchant") {
    return {
      success: false,
      message: "Forbidden: Only merchant accounts can perform setup.",
    };
  }
  // check user id is exist in merchant
  const is_setup = await checkExistingMerchant(userId);
  if (is_setup) {
    return {
      success: false,
      message: "Merchant profile already exists for this user.",
    };
  }

  // insert new merchants
  try {
    const newMerchantId = await insertNewMerchant(userId, data);
    return {
      success: true,
      message: "Merchant profile setup successfully.",
      merchant_id: newMerchantId,
    };
  } catch (error) {
    // 捕獲可能的資料庫錯誤，例如 unique key constraint 錯誤（如果 findMerchantByUserId 漏了檢查）
    console.error("Error inserting merchant:", error);
    return {
      success: false,
      message: "Failed to save merchant profile due to a database error.",
    };
  }
}
