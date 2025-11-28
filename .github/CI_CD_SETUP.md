# GitHub Actions CI/CD 設定指南

## 📋 功能說明

此 CI/CD 工作流程會自動執行以下測試：

1. **Setup Test Data** - 生成 5,000 個商家和 25,000 個餐盒測試資料
2. **Redis Performance Test** - 測試 Redis 快取效能（3km-20km 範圍）
3. **Cleanup Test Data** - 清理測試資料

## 🔐 必要的 GitHub Secrets 設定

在你的 GitHub repository 中設定以下 Secrets：

### 步驟 1: 前往 Repository Settings

```
你的專案 → Settings → Secrets and variables → Actions → New repository secret
```

### 步驟 2: 新增以下 Secrets

| Secret Name                | 說明                         | 範例值                   |
| -------------------------- | ---------------------------- | ------------------------ |
| `UPSTASH_REDIS_REST_URL`   | Upstash Redis REST API URL   | `https://xxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST API Token | `AXXXxxxx...`            |

### 取得 Upstash Redis 憑證

1. 登入 [Upstash Console](https://console.upstash.com/)
2. 選擇你的 Redis 資料庫
3. 在 "REST API" 分頁中找到：
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. 複製這些值並貼到 GitHub Secrets

## 🚀 觸發 CI/CD 的方式

### 自動觸發

當以下情況發生時會自動執行：

- Push 到 `master`、`main` 或 `develop` 分支
- 建立 Pull Request 到上述分支
- 修改 `backend/` 目錄下的檔案

### 手動觸發

1. 前往 GitHub repository
2. 點選 "Actions" 分頁
3. 選擇 "Backend Tests" workflow
4. 點選 "Run workflow" 按鈕

## 📊 工作流程詳細步驟

```yaml
1. 📥 Checkout code                    # 下載程式碼
2. 🔧 Setup Node.js                    # 設定 Node.js 22
3. 📦 Install dependencies             # 安裝 npm 套件
4. ⏳ Wait for MySQL                   # 等待 MySQL 啟動
5. 🗄️ Initialize Database Schema      # 建立資料庫表格
6. 🏪 Setup Test Data                  # 生成測試資料（5000 商家）
7. 🚀 Redis Performance Test           # Redis 效能測試
8. 📊 Display Test Summary             # 顯示測試摘要
9. 🧹 Cleanup Test Data                # 清理測試資料
10. 📈 Upload Test Results             # 上傳測試結果
```

## ⏱️ 預估執行時間

| 步驟           | 時間        |
| -------------- | ----------- |
| 環境設定       | ~2 分鐘     |
| 生成測試資料   | ~3 分鐘     |
| Redis 效能測試 | ~2 分鐘     |
| 清理資料       | ~30 秒      |
| **總計**       | **~8 分鐘** |

## 📈 查看測試結果

### 在 GitHub Actions 頁面

1. 前往 "Actions" 分頁
2. 選擇最近的 workflow run
3. 查看各個步驟的日誌輸出

### 測試摘要範例

```
================================
✅ 測試完成摘要
================================
- 商家數量: 5000
- 餐盒數量: 25000
- Redis 測試範圍: 3km, 5km, 10km, 15km, 20km
================================

Redis 效能測試結果:
範圍(km) | 加速倍數
---------|---------
   3.0   |  1.56x
   5.0   |  5.01x
  10.0   |  5.35x
  15.0   |  6.91x
  20.0   |  8.11x
```

## 🐛 故障排除

### MySQL 連線失敗

如果看到 "Error: connect ECONNREFUSED"：

- 確認 MySQL service 健康檢查已通過
- 檢查 `Wait for MySQL` 步驟的輸出

### Redis 連線失敗

如果看到 Redis 相關錯誤：

- 確認 GitHub Secrets 已正確設定
- 檢查 Upstash Redis 是否正常運作

### 測試資料生成逾時

如果 "Setup Test Data" 步驟逾時：

- 預設逾時設定為 10 分鐘
- 可以在 `.github/workflows/test.yml` 中調整 `timeout-minutes`

## 🔄 本地測試

在推送到 GitHub 前，可以本地測試：

```bash
# 使用 Docker Compose
docker compose run --rm test npm run test:setup
docker compose run --rm test npm run test:redis
docker compose run --rm test npm run test:cleanup

# 或使用測試腳本
./test.sh
```

## 📝 自訂配置

### 調整測試資料量

編輯 `backend/tests/setup-test-data.ts`:

```typescript
const config: TestDataConfig = {
  merchantCount: 5000, // 調整商家數量
  mealboxesPerMerchant: 5, // 調整每個商家的餐盒數
  radiusKm: 20, // 調整分布範圍
};
```

### 調整測試範圍

編輯 `backend/tests/redis-performance-test.ts`:

```typescript
const testRadii = [
  3000, // 3 km
  5000, // 5 km
  10000, // 10 km
  15000, // 15 km
  20000, // 20 km
];
```

## 🎯 最佳實踐

1. **Pull Request 前必執行** - 確保測試通過才合併
2. **定期執行** - 每週至少執行一次完整測試
3. **監控效能** - 追蹤 Redis 加速倍數的趨勢
4. **清理資料** - 確保測試後資料已清除

## 📚 相關文件

- [DOCKER_TEST_README.md](../DOCKER_TEST_README.md) - Docker 測試容器使用指南
- [K6_README.md](../K6_README.md) - K6 負載測試指南
- [backend/tests/README.md](../backend/tests/README.md) - 測試腳本說明
