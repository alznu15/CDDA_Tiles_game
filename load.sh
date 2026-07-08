#!/bin/bash
echo "🔄 正在檢查末日存檔..."

# 如果有雲端推上來的存檔壓縮包
if [ -f "cdda_save.zip" ]; then
    echo "📦 偵測到最新存檔，正在解壓縮覆蓋..."
    # 強制覆蓋舊存檔，並不顯示冗長訊息
    unzip -o cdda_save.zip -d ./cdda_game_dir/
    rm cdda_save.zip
    echo "✅ 存檔同步完成！"
else
    echo "ℹ️ 沒有發現壓縮存檔，將以本地進度開始。"
fi

echo "🎮 啟動 CDDA Tiles..."
cd ./cdda_game_dir/ && ./cataclysm-tiles
