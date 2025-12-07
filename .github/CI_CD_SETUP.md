# CI/CD 工作流程指南

## 工作流程架構

你的 CI/CD 設置包含兩個主要的 GitHub Actions 工作流程：

### 1. **CI (Continuous Integration)** - `ci.yml`

- **觸發條件**: Push 或 Pull Request 到 `main`, `master`, 或 `ci/cd` 分支
- **執行步驟**:
  1. 檢出代碼
  2. 設置 Node.js v20
  3. 安裝依賴 (`npm ci`)
  4. 運行 Linter (`npm run lint`)
  5. 運行單元測試 (`npm test`)

### 2. **CD (Continuous Deployment)** - `deploy.yml`

- **觸發條件**:
  - `workflow_run`: 當 "Backend Tests" (CI) 工作流程成功完成時自動觸發
  - `workflow_dispatch`: 手動觸發（按鈕）
- **執行步驟**:
  1. 檢查部署狀態（調試信息）
  2. 檢出代碼
  3. 建立 `.env` 文件
  4. Docker Compose 重啟容器

## 使用本地 act 測試

### 測試 CI 工作流程

```bash
cd /Users/nihaocheng/Desktop/Sideproject/Lefty
act -j test --container-architecture linux/amd64
```

### 測試部署（注意：部署在 self-hosted runner 上）

```bash
act -j deploy --container-architecture linux/amd64
```

## 在 GitHub 上測試完整流程

1. **推送代碼**到 `ci/cd` 分支（或 `main`/`master`）：

   ```bash
   git push origin ci/cd
   ```

2. **監控工作流程**：
   - 訪問 GitHub 倉庫 → Actions 標籤
   - 應該能看到 "Backend Tests" 運行
   - CI 完成後，"本地自動部署" 應自動觸發

3. **手動觸發部署**：
   - Actions 標籤 → "本地自動部署" → "Run workflow" 按鈕

## 工作流程狀態檢查

### CI 工作流程預期結果

```
✅ Set up job
✅ Checkout code
✅ Set up Node.js (v20.20.0)
✅ Install dependencies (729 packages)
✅ Run Linter (0 errors, ~44 warnings)
✅ Run Tests (1 test passed)
✅ Complete job
```

### CD 工作流程預期結果

```
✅ Set up job
✅ 部署狀態檢查
✅ Checkout code
✅ Create .env file
✅ Docker Compose 重啟
✅ Complete job
```

## 常見問題排查

### 問題 1: CD 未自動觸發

**原因**: GitHub Actions 可能需要在遠程倉庫中看到工作流程文件
**解決**:

1. 確保 `.github/workflows/deploy.yml` 已推送到遠程
2. 確保 CI 工作流程成功完成（status: success）
3. 在 GitHub Actions 頁面查看「Workflow runs」歷史記錄

### 問題 2: 部署失敗

**原因**: self-hosted runner 可能未運行
**解決**:

1. 確認 GitHub Actions Runner 已啟動
2. 檢查 runner 的日誌文件
3. 手動觸發 `workflow_dispatch` 測試

### 問題 3: ESLint 錯誤

**原因**: 配置文件遷移問題
**解決**:

- 已使用 `eslint.config.mjs` 替換舊的 `.eslintrc.json`
- 已安裝必要的依賴: `typescript-eslint`, `@eslint/js`
- 運行 `npm install` 確保依賴已安裝

## 相關文件

- CI 工作流程: `.github/workflows/ci.yml`
- CD 工作流程: `.github/workflows/deploy.yml`
- ESLint 配置: `backend/eslint.config.mjs`
- 依賴配置: `backend/package.json`

## 下一步

- 監控 GitHub Actions 的運行日誌
- 如果有失敗，檢查具體錯誤信息
- 根據需要調整部署步驟（如環境變量、Docker 配置等）
