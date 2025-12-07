import app from "./app";
import { initializeDatabase } from "./db";
import dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

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