import { Router, Request, Response } from "express";
import pool from "../db";
import { RowDataPacket } from "mysql2";
import { authenticateToken } from "../middleware/auth";

const router = Router();

// Interface for User
interface User extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  password: string;
}

// Custom Request interface with user data
interface AuthRequest extends Request {
  user?: any;
}

/**
 * GET /user/profile
 * Get current user's profile information
 * Requires: Authentication token
 */
router.get(
  "/profile",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const [users] = await pool.query<User[]>(
        "SELECT * FROM users WHERE id = ?",
        [req.user.id]
      );

      if (users.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      res.status(200).json({
        email: users[0].email,
        name: users[0].name,
      });
    } catch (error) {
      console.error("Profile error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
