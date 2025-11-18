import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMerchant extends Document {
  name: string;
  category?: string;
  location: {
    type: "Point";
    coordinates: number[]; // [lng, lat]
  };
}

const MerchantSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    category: { type: String, index: true },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
  },
  { timestamps: true }
);

// Ensure 2dsphere index for geospatial queries
MerchantSchema.index({ location: "2dsphere" });

const Merchant: Model<IMerchant> =
  mongoose.models.Merchant ||
  mongoose.model<IMerchant>("Merchant", MerchantSchema);

export default Merchant;
