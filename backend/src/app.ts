import express, { Request, Response } from "express";
const cors = require("cors");
import dotenv from "dotenv";
import { RowDataPacket } from "mysql2";
// Import route modules
import authRoutes from "./routes/auth";
import userRoutes from "./routes/user";
import merchantRoutes from "./routes/merchants";
import publicRoutes from "./routes/public";
import { authenticateToken } from "./middleware/auth";

// Load environment variables from .env
dotenv.config();

// Create express environments
const app = express();

// express middleware to parse to request body
app.use(express.json({ limit: "50mb" }));

app.use(cors());
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Route middleware
app.use("/auth", authRoutes);
app.use("/user", authenticateToken, userRoutes);
app.use("/merchants", merchantRoutes);
app.use("/", publicRoutes); // 公開路由：/nearby、/health/redis

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

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

export default app;
