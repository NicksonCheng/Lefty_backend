import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { Db } from "mongodb";
dotenv.config();
// Create a connection pool to the database
// A pool is more efficient than creating a new connection for every query.
const is_dev = process.env.NODE_ENV === "development";
const pool = mysql.createPool({
  host: process.env.DB_HOST || "mysql",
  port: Number(process.env.DB_PORT) || 3306,
  user: is_dev ? process.env.DB_USER : process.env.TEST_DB_USER,
  password: is_dev ? process.env.DB_PASSWORD : process.env.TEST_DB_PASSWORD,
  database: is_dev ? process.env.DB_NAME : process.env.TEST_DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;

// Initialize database
export async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();

    const user_sql = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('user', 'merchant') DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    const mealbox_sql = `
      CREATE TABLE IF NOT EXISTS mealboxes (
          id              BIGINT AUTO_INCREMENT PRIMARY KEY,
          merchant_id     BIGINT NOT NULL, -- Foreign Key 關聯到 merchants
          
          name            VARCHAR(200) NOT NULL, -- 改叫 name 比 title 直觀
          description     TEXT,
          original_price  INT NOT NULL,
          discount_price  INT NOT NULL,
          quantity        INT NOT NULL DEFAULT 0, -- 剩餘庫存
          img_url         VARCHAR(500),
          
          pickup_time_start CHAR(5), -- 例如 "19:30"
          pickup_time_end   CHAR(5), -- 例如 "20:30"
          
          is_active       TINYINT(1) NOT NULL DEFAULT 1, -- 是否上架中
          created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

          FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
          INDEX idx_merchant_active (merchant_id, is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    const merchant_sql = `CREATE TABLE IF NOT EXISTS merchants (
        id              BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id         BIGINT NOT NULL UNIQUE, -- Foreign Key link to users
        store_name      VARCHAR(100) NOT NULL,
        address         VARCHAR(255),
        phone           VARCHAR(20),
        avatar_url      VARCHAR(500), -- 商家頭像/Logo
        
        -- 地理位置資訊 (只存在於商家)
        lat             DECIMAL(10, 8) NOT NULL,
        lng             DECIMAL(11, 8) NOT NULL,
        location        POINT NOT NULL SRID 4326,
        
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        -- 空間索引建立在商家上
        SPATIAL INDEX idx_spatial_location (location)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
    await connection.query(user_sql);
    await connection.query(merchant_sql);
    await connection.query(mealbox_sql);
    connection.release();
    console.log("MYSQL Database initialized successfully");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}
