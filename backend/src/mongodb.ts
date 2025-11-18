import mongoose from "mongoose";
import dotenv from "dotenv";
import Merchant from "./models/merchant";

dotenv.config();

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/merchants_db";

/**
 * Initialize MongoDB (via mongoose)
 */
async function initializeMongoDB(): Promise<void> {
  try {
    await mongoose.connect(MONGO_URI, {
      // useNewUrlParser and useUnifiedTopology are default in newer mongoose versions
    });
    console.log(`Mongoose connected to ${MONGO_URI}`);

    // Ensure indexes for merchant model (creates 2dsphere index)
    try {
      await Merchant.createIndexes();
      console.log("Merchant indexes ensured");
    } catch (idxErr) {
      console.warn("Error ensuring merchant indexes:", idxErr);
    }
  } catch (error) {
    console.error("Mongoose connection error:", error);
    throw error;
  }
}

export { initializeMongoDB, mongoose };
