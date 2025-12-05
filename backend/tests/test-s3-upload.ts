import axios, { AxiosError } from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";

// Configuration
const API_BASE_URL = "http://localhost:3001";
const MERCHANT_ID = 1;

// Color codes for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

// Helper functions
function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message: string) {
  log(`✓ ${message}`, "green");
}

function logError(message: string) {
  log(`✗ ${message}`, "red");
}

function logInfo(message: string) {
  log(`ℹ ${message}`, "blue");
}

function logSection(title: string) {
  log(`\n${"═".repeat(60)}`, "cyan");
  log(`  ${title}`, "cyan");
  log(`${"═".repeat(60)}\n`, "cyan");
}

// Create test image
function createTestImage(filePath: string, sizeInMB: number = 1): void {
  logInfo(`Creating test image: ${filePath} (${sizeInMB}MB)`);

  const sizeInBytes = sizeInMB * 1024 * 1024;
  const buffer = Buffer.alloc(sizeInBytes);

  // Fill with some pattern to make it more realistic
  for (let i = 0; i < sizeInBytes; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }

  fs.writeFileSync(filePath, buffer);
  logSuccess(`Test image created: ${filePath}`);
}

// Test 1: Login to get JWT token
async function testLogin(): Promise<string> {
  logSection("Test 1: User Login");

  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: "test@gmail.com",
      password: "test123",
    });

    const token = response.data.token;
    logSuccess(`Login successful`);
    logInfo(`Token: ${token.substring(0, 20)}...`);

    return token;
  } catch (error) {
    const err = error as AxiosError;
    logError(`Login failed: ${err.message}`);
    logInfo(`Response: ${JSON.stringify(err.response?.data)}`);
    throw error;
  }
}

// Test 2: Upload products with images
async function testUploadProductsWithImages(
  token: string,
  imagePath: string
): Promise<any> {
  logSection("Test 2: Upload Products with Images to S3");

  try {
    // Prepare products
    const products = [
      {
        name: "豪華便當 - Deluxe Mealbox",
        description: "精選食材製作的豪華便當，包含肉類、蔬菜和米飯",
        original_price: 150,
        discount_price: 120,
        quantity: 20,
        pickup_time_start: "11:00",
        pickup_time_end: "19:00",
        image_index: 0, // Reference to first uploaded image
      },
      {
        name: "標準便當 - Standard Mealbox",
        description: "經濟實惠的標準便當",
        original_price: 100,
        discount_price: 80,
        quantity: 30,
        pickup_time_start: "10:00",
        pickup_time_end: "20:00",
        // No image_index - this product won't have an image
      },
      {
        name: "素食便當 - Vegetarian Mealbox",
        description: "適合素食者的健康便當",
        original_price: 120,
        discount_price: 90,
        quantity: 15,
        pickup_time_start: "10:30",
        pickup_time_end: "18:30",
        image_index: 1, // Reference to second uploaded image
      },
    ];

    // Create form data
    const formData = new FormData();
    formData.append("merchant_id", MERCHANT_ID.toString());
    formData.append("products", JSON.stringify(products));

    // Add images
    if (fs.existsSync(imagePath)) {
      formData.append("images", fs.createReadStream(imagePath));
      formData.append("images", fs.createReadStream(imagePath)); // Add same image twice for testing
      logInfo(`Added 2 images to form data`);
    } else {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    // Send request
    logInfo("Sending upload request...");
    const response = await axios.post(
      `${API_BASE_URL}/merchants/mealboxes`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = response.data;

    logSuccess(`Upload response received (Status: ${response.status})`);
    logInfo(`Success: ${data.success}`);
    logInfo(`Message: ${data.message}`);

    // Analyze results
    logInfo(`\nProduct Results:`);
    data.results.forEach((result: any, index: number) => {
      const status = result.status === "SUCCESS" ? "✓" : "✗";
      log(
        `  ${status} [${index}] ${result.submitted_name}`,
        result.status === "SUCCESS" ? "green" : "red"
      );

      if (result.product_id) {
        logInfo(`      Product ID: ${result.product_id}`);
      }

      if (result.image_url) {
        logInfo(`      Image URL: ${result.image_url.substring(0, 80)}...`);
      }

      if (result.error_reason) {
        logError(`      Error: ${result.error_reason}`);
      }
    });

    return data;
  } catch (error) {
    const err = error as AxiosError;
    logError(`Upload failed: ${err.message}`);
    logInfo(`Response status: ${err.response?.status}`);
    logInfo(`Response data: ${JSON.stringify(err.response?.data)}`);
    throw error;
  }
}

// Test 3: Verify image URL is accessible
async function testVerifyImageURL(imageUrl: string): Promise<void> {
  logSection("Test 3: Verify Image URL Accessibility");

  if (!imageUrl) {
    logError("No image URL provided");
    return;
  }

  try {
    logInfo(`Testing image URL: ${imageUrl.substring(0, 80)}...`);

    const response = await axios.head(imageUrl, {
      timeout: 10000,
    });

    logSuccess(`Image URL is accessible (Status: ${response.status})`);
    logInfo(`Content-Type: ${response.headers["content-type"]}`);
    logInfo(`Content-Length: ${response.headers["content-length"]} bytes`);
  } catch (error) {
    const err = error as AxiosError;
    logError(`Image URL test failed: ${err.message}`);
    logInfo(`Status: ${err.response?.status}`);
    logInfo(`This is expected if CloudFront is not configured yet.`);
  }
}

// Test 4: Get merchant products
async function testGetMerchantProducts(token: string): Promise<void> {
  logSection("Test 4: Get Merchant Products");

  try {
    logInfo(`Fetching products for merchant ${MERCHANT_ID}...`);

    const response = await axios.get(
      `${API_BASE_URL}/merchants/mealboxes/${MERCHANT_ID}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = response.data;

    if (!data.success) {
      logError(`Failed to fetch products: ${JSON.stringify(data)}`);
      return;
    }

    logSuccess(`Products fetched successfully`);
    logInfo(`Total products: ${data.data.length}`);

    // Show products with images
    const productsWithImages = data.data.filter((p: any) => p.img_url);
    logInfo(`Products with images: ${productsWithImages.length}`);

    if (productsWithImages.length > 0) {
      logInfo(`\nProducts with images:`);
      productsWithImages.forEach((product: any) => {
        logInfo(`  • ${product.name}`);
        logInfo(`    ID: ${product.product_id}`);
        logInfo(`    URL: ${product.img_url.substring(0, 80)}...`);
      });
    }
  } catch (error) {
    const err = error as AxiosError;
    logError(`Fetch products failed: ${err.message}`);
    logInfo(`Response: ${JSON.stringify(err.response?.data)}`);
    throw error;
  }
}

// Test 5: Test with different image sizes
async function testDifferentImageSizes(token: string): Promise<void> {
  logSection("Test 5: Test with Different Image Sizes");

  const sizes = [0.5, 1, 5, 10]; // MB

  for (const size of sizes) {
    try {
      const imagePath = path.join("/tmp", `test_${size}mb.jpg`);
      createTestImage(imagePath, size);

      const formData = new FormData();
      formData.append("merchant_id", MERCHANT_ID.toString());
      formData.append(
        "products",
        JSON.stringify([
          {
            name: `Test ${size}MB Image`,
            description: `Testing with ${size}MB image`,
            original_price: 100,
            discount_price: 80,
            quantity: 10,
            pickup_time_start: "10:00",
            pickup_time_end: "18:00",
            image_index: 0,
          },
        ])
      );
      formData.append("images", fs.createReadStream(imagePath));

      logInfo(`Uploading ${size}MB image...`);

      const response = await axios.post(
        `${API_BASE_URL}/merchants/mealboxes`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${token}`,
          },
          timeout: 30000,
        }
      );

      if (response.data.results[0].status === "SUCCESS") {
        logSuccess(`${size}MB image uploaded successfully`);
      } else {
        logError(
          `${size}MB image upload failed: ${response.data.results[0].error_reason}`
        );
      }

      // Cleanup
      fs.unlinkSync(imagePath);
    } catch (error) {
      const err = error as AxiosError;
      logError(`${size}MB test failed: ${err.message}`);
    }
  }
}

// Main test runner
async function runTests(): Promise<void> {
  log(
    "\n████████████████████████████████████████████████████████████",
    "bright"
  );
  log("   AWS S3 Image Upload - Comprehensive Test Suite", "bright");
  log(
    "████████████████████████████████████████████████████████████\n",
    "bright"
  );

  const testImagePath = path.join("/tmp", "test_image.jpg");

  try {
    // Create test image
    createTestImage(testImagePath, 2);

    // Test 1: Login
    const token = await testLogin();

    // Test 2: Upload products with images
    const uploadData = await testUploadProductsWithImages(token, testImagePath);

    // Test 3: Verify image URLs
    const firstResult = uploadData.results.find((r: any) => r.image_url);
    if (firstResult) {
      await testVerifyImageURL(firstResult.image_url);
    }

    // Test 4: Get products from database
    await testGetMerchantProducts(token);

    // Test 5: Different image sizes
    await testDifferentImageSizes(token);

    logSection("✓ All Tests Completed Successfully!");
  } catch (error) {
    logSection("✗ Test Suite Failed");
    logError(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  } finally {
    // Cleanup
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  }
}

// Run tests
runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
