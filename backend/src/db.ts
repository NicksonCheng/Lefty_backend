import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();
// console.log(process.env.DB_HOST);
// console.log("DB_PASSWORD =", process.env.DB_PASSWORD); // 測試是否讀到
// Create a connection pool to the database
// A pool is more efficient than creating a new connection for every query.
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "Lefty",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;
