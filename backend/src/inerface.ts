// src/interfaces/User.ts

// 假設你使用 'mysql2' 或類似的函式庫，並從中匯入 RowDataPacket
import { RowDataPacket } from "mysql2";

/**
 * @description 代表資料庫中 'user' 表格的一行資料，同時擴展了 RowDataPacket 型別。
 */
export interface User extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  password: string;
}
export interface MealBox extends RowDataPacket {
  id: number;
  store_name: string;
  title: string;
  description: string;
  original_price: number;
  discount_price: number;
  quantity: number;
  lat: number;
  lng: number;
  location: string; // POINT 型別通常以字串形式表示
  available: boolean;
  pickup_until: Date;
  created_at: Date;
  updated_at: Date;
}

// 如果未來有其他型別，可以也放在這裡或建立新的檔案
// export interface Post extends RowDataPacket { ... }
