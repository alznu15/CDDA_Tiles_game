#!/bin/bash
echo "💾 正在儲存 CDDA 遊戲進度..."

# 1. 打包 save 資料夾 (假設在 cdda_game_dir/save)
zip -r cdda_save.zip ./cdda_game_dir/save/

# 2. 自動偵測目前是哪一個基地並更新狀態
# 註：這裏可以加入你的 API 邏輯去抓 GitHub Billing，如果求快，可以用最原始的記時法或手動輸入
CURRENT_BASE="GH_Account_A"
if [ "$GITPOD_WORKSPACE_ID" != "" ]; then
    CURRENT_BASE="Gitpod"
elif [ "$CODESPACES" = "true" ] && [ "$(git config user.name)" != "AccountA" ]; then
    CURRENT_BASE="GH_Account_B"
fi

# 寫入狀態檔 (供前端入口網頁讀取)
echo "{\"last_base\": \"$CURRENT_BASE\", \"save_time\": \"$(date '+%Y-%m-%d %H:%M:%S')\"}" > status.json

# 3. 推回中央儲存庫 (使用 Token 確保跨帳號權限)
git add cdda_save.zip status.json
git commit -m "自動存檔 - 來自 $CURRENT_BASE ($(date '+%m/%d %H:%M'))"
git push origin main

echo "🚀 進度已安全上傳至中央硬碟！現在可以安全關閉分頁。"
