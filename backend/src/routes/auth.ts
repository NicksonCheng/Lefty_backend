import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

/*
  ResultSetHeader
  insertId	number	新插入記錄的自動遞增 ID。	這是您在剛才的 INSERT 範例中最需要的屬性。
  affectedRows	number	受本次操作影響的行數。	INSERT 通常為 1；DELETE 或 UPDATE 則是被刪除或更新的行數。
  changedRows	number	實際內容被更改的行數。	主要用於 UPDATE 語句。如果您嘗試用相同的資料更新一筆記錄，affectedRows 可能為 1，但 changedRows 可能為 0。
  fieldCount	number	欄位數量。	通常為 0，因為非查詢語句不回傳欄位資料。
  warningCount	number	執行過程中產生的警告數。	用於錯誤檢查或診斷。
*/

const router = Router();

// Interface for User
interface User extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  password: string;
}

/**
 * POST /auth/register
 * Register a new user
 * Body: { name, email, password, role }
 */
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    // Validate input
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Check if user exists
    const [existingUsers] = await pool.query<RowDataPacket[]>(
      "SELECT 1 FROM users WHERE email = ? OR name = ?",
      [email, name]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const [result] = await pool.query<ResultSetHeader>(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
      [name, email, hashedPassword, role]
    );
    const newUserId: number = result.insertId;
    res.status(200).json({
      message: "User registered successfully",
      user_id: newUserId,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /auth/login
 * Login user and return JWT token
 * Body: { email, password }
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user
    const [users] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );
    console.log(users);
    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = users[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid Password" });
    }

    // Generate JWT
    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    const secret = process.env.JWT_SECRET || "dev_secret_change_me";
    const token = jwt.sign(payload, secret, { expiresIn: "1h" });

    // Return token and user info (exclude password)
    return res.status(200).json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    console.log("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /auth/logout
 * Logout user (client-side token removal)
 * Requires: Authorization header with valid JWT
 */
router.post("/logout", (req: Request, res: Response) => {
  try {
    // JWT logout is handled client-side by removing the token
    // This endpoint serves as a confirmation and can be extended with token blacklisting
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
