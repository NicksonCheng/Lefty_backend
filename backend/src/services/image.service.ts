import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from "path";
import crypto from "crypto";

// Initialize S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-southeast-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const S3_BUCKET = process.env.AWS_S3_BUCKET || "lefty-mealbox-images";
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN || "";

export interface ImageUploadResult {
  success: boolean;
  s3Key: string;
  imageUrl: string;
  fileSize: number;
}

/**
 * Generate unique S3 key
 * Format: merchants/{merchantId}/mealboxes/{mealboxId}/{timestamp}-{random}.jpg
 */
function generateS3Key(
  merchantId: string,
  mealboxId: string,
  originalFileName: string
): string {
  const ext = path.extname(originalFileName).toLowerCase();
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString("hex");
  return `merchants/${merchantId}/mealboxes/${mealboxId}/${timestamp}-${random}${ext}`;
}

/**
 * Upload image to S3
 * Returns the S3 key and a signed URL (24 hours)
 * Frontend can use the s3Key to generate long-lived signed URLs
 */
export async function uploadImageToS3(
  buffer: Buffer,
  merchantId: string,
  mealboxId: string,
  fileName: string
): Promise<ImageUploadResult> {
  try {
    const s3Key = generateS3Key(merchantId, mealboxId, fileName);

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: "image/jpeg",
      CacheControl: "max-age=31536000,public", // 1 year cache
      Metadata: {
        "merchant-id": merchantId,
        "mealbox-id": mealboxId,
        "upload-timestamp": new Date().toISOString(),
      },
    });

    await s3Client.send(command);

    // 生成 24 小時簽名 URL 用於立即訪問
    const getCommand = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    });
    const signedUrl = await getSignedUrl(s3Client, getCommand, {
      expiresIn: 86400, // 24 hours
    });

    // 如果配置了 CloudFront，使用 CloudFront URL；否則使用簽名 URL
    const imageUrl = CLOUDFRONT_DOMAIN
      ? `https://${CLOUDFRONT_DOMAIN}/${s3Key}`
      : signedUrl;

    return {
      success: true,
      s3Key,
      imageUrl,
      fileSize: buffer.length,
    };
  } catch (error) {
    console.error(`Error uploading image ${fileName} to S3:`, error);
    throw new Error(`Failed to upload image to S3: ${error}`);
  }
}

/**
 * Generate a signed URL for accessing an image in S3
 * Use this to generate new signed URLs when the old one expires
 */
export async function generateSignedUrlForImage(
  s3Key: string,
  expiresIn: number = 86400 // Default: 24 hours
): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    });
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    console.error(`Error generating signed URL for ${s3Key}:`, error);
    throw new Error(`Failed to generate signed URL: ${error}`);
  }
}

/**
 * Delete image from S3
 */
export async function deleteImageFromS3(s3Key: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    });
    await s3Client.send(command);
  } catch (error) {
    console.error(`Error deleting image ${s3Key} from S3:`, error);
    throw new Error(`Failed to delete image from S3: ${error}`);
  }
}

export default s3Client;
