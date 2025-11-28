#!/bin/bash
# 測試工具快速啟動腳本

set -e

echo "============================================================"
echo "🧪 Lefty Backend 測試工具"
echo "============================================================"
echo ""
echo "請選擇要執行的測試："
echo ""
echo "  1) 生成測試資料 (500 商家 × 5 餐盒)"
echo "  2) Redis 效能測試"
echo "  3) 清除測試資料"
echo "  4) 完整測試流程 (生成資料 → 效能測試 → 清除資料)"
echo "  0) 退出"
echo ""
read -p "請輸入選項 [0-4]: " choice

case $choice in
  1)
    echo ""
    echo "🏪 生成測試資料..."
    docker compose run --rm test npm run test:setup
    ;;
  2)
    echo ""
    echo "📊 執行 Redis 效能測試..."
    docker compose run --rm test npm run test:redis
    ;;
  3)
    echo ""
    echo "🧹 清除測試資料..."
    docker compose run --rm test npm run test:cleanup
    ;;
  4)
    echo ""
    echo "🔄 執行完整測試流程..."
    echo ""
    echo "步驟 1/3: 生成測試資料..."
    docker compose run --rm test npm run test:setup
    echo ""
    echo "步驟 2/3: 執行效能測試..."
    docker compose run --rm test npm run test:redis
    echo ""
    echo "步驟 3/3: 清除測試資料..."
    docker compose run --rm test npm run test:cleanup
    echo ""
    echo "✅ 完整測試流程完成！"
    ;;
  0)
    echo "👋 再見！"
    exit 0
    ;;
  *)
    echo "❌ 無效的選項"
    exit 1
    ;;
esac

echo ""
echo "============================================================"
echo "✅ 測試完成"
echo "============================================================"
