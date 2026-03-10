#!/bin/bash

# --- AYARLAR ---

GITHUB_USER="userboxtr"
GITHUB_REPO="firsaturuncom"
GITHUB_TOKEN="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"

COMMIT_MESAJI="Sunucudan temiz aktarım - $(date +'%d-%m-%Y %H:%M')"

echo "🚀 Git işlemi baştan aşağı yenileniyor..."

# 1. Sıfırdan başlat
rm -rf .git
git init

# 2. Gitignore oluştur (Scriptin kendisini ve hassas verileri gizle)
echo "git.sh" > .gitignore
echo "node_modules/" >> .gitignore
echo ".env" >> .gitignore
echo ".DS_Store" >> .gitignore

# 3. Uzak depoyu (Remote) bağla
REMOTE_URL="https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${GITHUB_REPO}.git"
git remote add origin "$REMOTE_URL"

# 4. Dosyaları ekle ve Commit et
git add .
git commit -m "$COMMIT_MESAJI"

# 5. Push et
git branch -M main
echo "📤 Dosyalar zorlanarak gönderiliyor..."
git push -f -u origin main

echo "✅ İşlem TAMAMLANDI! GitHub'ı kontrol edebilirsin."
