# 效能測試工具

## 概述

這個資料夾包含用於測試 Redis 快取效能的工具：

1. **setup-test-data.ts** - 生成測試資料
2. **redis-performance-test.ts** - 執行效能測試

## 使用步驟

### 前置需求

確保：

1. ✅ Docker Compose 服務正在運行（MySQL 和 Redis）
2. ✅ MySQL 可從 localhost:3306 連線
3. ✅ `.env` 檔案已正確設定

```bash
# 啟動服務
docker compose up -d

# 確認 MySQL 運行中
docker compose ps mysql_db
```

### 1. 生成測試資料

首先需要在資料庫中生成大量測試資料：

```bash
npx ts-node tests/setup-test-data.ts
```

預設會在台北車站附近（25.0478, 121.5170）生成：

- 500 個商家
- 每個商家 5 個餐盒
- 分布在 10 公里半徑內
- 總共 2,500 個餐盒

你可以修改 `setup-test-data.ts` 中的 `config` 物件來調整：

```typescript
const config: TestDataConfig = {
  centerLat: 25.0478, // 中心緯度
  centerLng: 121.517, // 中心經度
  merchantCount: 500, // 商家數量
  mealboxesPerMerchant: 5, // 每個商家的餐盒數
  radiusKm: 10, // 分布半徑（公里）
};
```

### 2. 執行效能測試

生成資料後，執行效能測試：

```bash
npx ts-node tests/redis-performance-test.ts
```

測試會：

- 測試 5 種不同的搜尋範圍（1km, 3km, 5km, 10km, 15km）
- 每個範圍執行 3 輪測試取平均值
- 比較有/無 Redis 快取的查詢速度
- 顯示加速倍數

### 3. 清除測試資料

再次執行 `setup-test-data.ts` 會自動清除舊的測試資料並生成新的。

手動清除：

```sql
DELETE mb FROM mealboxes mb
JOIN merchants m ON mb.merchant_id = m.id
WHERE m.email LIKE 'test%@merchant.com';

DELETE FROM merchants WHERE email LIKE 'test%@merchant.com';
```

## 輸出範例

```
================================================================================
📈 效能測試結果摘要
================================================================================

範圍(km) | 資料量 | 無快取(ms) | 有快取-首次(ms) | 有快取-快取(ms) | 加速倍數
--------------------------------------------------------------------------------
     1.0 |     12 |       45.3 |            48.2 |             2.1 |    21.57x
     3.0 |     89 |      156.7 |           162.3 |             2.3 |    68.13x
     5.0 |    234 |      342.8 |           348.1 |             2.5 |   137.12x
    10.0 |    456 |      689.2 |           695.7 |             2.8 |   246.14x
    15.0 |    498 |      723.5 |           729.8 |             3.1 |   233.39x
--------------------------------------------------------------------------------

💡 結論:
   - 1.0km 範圍: Redis 快取加速 21.57x (12 筆資料)
   - 3.0km 範圍: Redis 快取加速 68.13x (89 筆資料)
   - 5.0km 範圍: Redis 快取加速 137.12x (234 筆資料)
   - 10.0km 範圍: Redis 快取加速 246.14x (456 筆資料)
   - 15.0km 範圍: Redis 快取加速 233.39x (498 筆資料)

🏆 最佳加速效果: 10.0km 範圍，加速 246.14 倍
```

## 測試說明

### 無 Redis 測試

- 直接查詢 MySQL 資料庫
- 執行 3 次取平均值
- 包含 GIS 空間計算（ST_Distance_Sphere）
- 包含 JSON 聚合（JSON_ARRAYAGG）

### 有 Redis 測試

- **首次查詢**: 查詢資料庫並寫入 Redis（TTL 30 秒）
- **快取查詢**: 直接從 Redis 讀取
- 測量從快取讀取的速度

### 加速倍數計算

```
加速倍數 = 無快取平均時間 / 快取查詢時間
```

## 預期結果

隨著搜尋範圍擴大，你應該看到：

1. ✅ 資料量增加
2. ✅ 無快取查詢時間增加
3. ✅ 快取查詢時間保持穩定（~2-5ms）
4. ✅ 加速倍數增加（資料越多，快取優勢越明顯）

## 注意事項

- 測試資料的商家 email 格式為 `test{n}@merchant.com`，方便識別和清除
- 測試會自動清除舊資料，不會重複累積
- Redis TTL 設定為 30 秒，測試完會自動清除快取
- 建議在開發環境執行，不要在正式環境使用

## 調整測試範圍

修改 `redis-performance-test.ts` 中的 `testRadii` 陣列：

```typescript
const testRadii = [
  500, // 0.5 km
  1000, // 1 km
  2000, // 2 km
  5000, // 5 km
  10000, // 10 km
  20000, // 20 km
];
```

## 故障排除

### 連線錯誤: ENOTFOUND mysql

這表示測試腳本無法連線到資料庫。解決方法：

```bash
# 1. 確認 Docker 服務運行中
docker compose ps

# 2. 確認 MySQL 可從 localhost 連線
docker compose port mysql_db 3306
# 應該顯示: 0.0.0.0:3306

# 3. 測試連線
mysql -h localhost -P 3306 -u root -p
```

**注意**: 測試腳本已設定為連線到 `localhost:3306`，確保你的 `docker-compose.yml` 有正確的 port mapping：

```yaml
mysql_db:
  ports:
    - "3306:3306"
```

### 找不到測試資料

確認已執行 `setup-test-data.ts` 生成測試資料。

### Redis 連線錯誤

檢查 `.env` 中的 Redis 設定是否正確。

### MySQL 查詢緩慢

- 檢查 `merchants.location` 是否有 SPATIAL INDEX
- 檢查測試資料量是否過大
