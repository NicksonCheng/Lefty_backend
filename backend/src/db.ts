import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { Db } from "mongodb";
dotenv.config();
// Create a connection pool to the database
// A pool is more efficient than creating a new connection for every query.
const is_dev = process.env.NODE_ENV === "development";
const pool = mysql.createPool({
  host: process.env.DB_HOST || "mysql",
  user: is_dev ? process.env.DB_USER : process.env.TEST_DB_USER,
  password: is_dev ? process.env.DB_PASSWORD : process.env.TEST_DB_PASSWORD,
  database: is_dev ? process.env.DB_NAME : process.env.TEST_DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;
