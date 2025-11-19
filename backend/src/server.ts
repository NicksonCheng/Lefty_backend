import express, { Request, Response } from "express";
const cors = require("cors");
import dotenv from "dotenv";
import pool from "./db";
import { initializeMongoDB } from "./mongodb";
import { RowDataPacket } from "mysql2";
// Import route modules
import authRoutes from "./routes/auth";
import userRoutes from "./routes/user";
import merchantRoutes from "./routes/merchants";
import { authenticateToken } from "./middleware/auth";

// Load environment variables from .env
dotenv.config();

// Create express environments
const app = express();

// express middleware to parse to request body
app.use(express.json());

app.use(cors());
app.use(express.urlencoded({ extended: true }));

// Route middleware
app.use("/auth", authRoutes);
app.use("/user", authenticateToken, userRoutes);
app.use("/merchants", merchantRoutes);

app.get("/", (req, res) => {
  // 模擬不同 server 延遲
  // return res.json({
  //   message: `${process.env.DB_HOST}, ${process.env.DB_NAME}, ${process.env.DB_USER}, ${process.env.DB_PASSWORD}`,
  // });
  const delay = Math.floor(Math.random() * 2000);
  setTimeout(() => {
    res.json({
      message: `Hello from ${
        process.env.HOSTNAME || "backend"
      } (delay ${delay}ms)`,
    });
  }, delay);
});
app.get("", () => {});
// Interface for User
interface User extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  password: string;
}

// 🔸 自訂 Request 型別，讓 req.user 不報錯
interface AuthRequest extends Request {
  user?: any;
}

// Initialize database
async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('user', 'merchant') DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const mealbox_sql = `
      CREATE TABLE IF NOT EXISTS mealbox (
        id              BIGINT AUTO_INCREMENT PRIMARY KEY,
        store_name      VARCHAR(100) NOT NULL,
        title           VARCHAR(200) NOT NULL,
        description     TEXT,
        original_price  INT NOT NULL,
        discount_price  INT NOT NULL,
        quantity        INT NOT NULL DEFAULT 1,
        lat             DECIMAL(10, 8) NOT NULL,
        lng             DECIMAL(11, 8) NOT NULL,
        location        POINT NOT NULL SRID 4326,   -- 這才是重點！
        available       TINYINT(1) NOT NULL DEFAULT 1,
        pickup_until    DATETIME NOT NULL,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        INDEX idx_location (lat, lng),
        SPATIAL INDEX idx_spatial_location (location)   -- 只能對 location 這個 POINT 欄位
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    await connection.query(mealbox_sql);
    connection.release();
    console.log("MYSQL Database initialized successfully");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}
// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  // It's good practice to initialize the DB before the server starts listening.
  await initializeDatabase();
  //await initializeMongoDB();
  const secret = process.env.JWT_SECRET || "dev_secret_change_me";
  if (secret === "dev_secret_change_me") {
    console.warn(
      "WARNING: Using default JWT secret. Set JWT_SECRET in .env for production."
    );
  }

  console.log(`Server is running on http://localhost:${PORT}`);
});
