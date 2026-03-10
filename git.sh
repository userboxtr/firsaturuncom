#!/bin/bash

# --- AYARLAR ---
GITHUB_USER="userboxtr"
GITHUB_REPO="firsaturuncom"
GITHUB_TOKEN="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"
COMMIT_MESAJI="Sunucudan otomatik aktarım - $(date +'%d-%m-%Y %H:%M')"

echo "🚀 Git işlemi başlatılıyor..."

# 1. Git'i başlat (Eğer daha önce başlatılmadıysa)
if [ ! -d ".git" ]; then
    git init
    echo "✅ Git init tamamlandı."
fi

# 2. Uzak depoyu (Remote) güncelle veya ekle
# Token'ı URL'ye gömerek şifre sorma aşamasını atlıyoruz
REMOTE_URL="https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${GITHUB_REPO}.git"
git remote remove origin 2>/dev/null
git remote add origin "$REMOTE_URL"

# 3. Dosyaları ekle ve Commit et
git add .gitignore
git add .
git commit -m "$COMMIT_MESAJI"

# 4. Ana branch adını ayarla ve Push et
git branch -M main
echo "📤 Dosyalar gönderiliyor..."
git push -u origin main

echo "✅ İşlem başarıyla tamamlandı!"
