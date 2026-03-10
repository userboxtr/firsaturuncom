#!/bin/bash

# --- AYARLAR ---
GITHUB_USER="userboxtr"
GITHUB_REPO="firsaturuncom"
GITHUB_TOKEN="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"

COMMIT_MESAJI="Güncelleme: $(date +'%d-%m-%Y %H:%M')"

echo "🔄 Değişiklikler taranıyor..."

# 1. Uzak depo adresini (Token ile) tekrar doğrula (Değişmiş olabilir diye)
REMOTE_URL="https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${GITHUB_REPO}.git"
git remote set-url origin "$REMOTE_URL"

# 2. Değişen dosyaları ekle
git add .

# 3. Kaydet
git commit -m "$COMMIT_MESAJI"

# 4. Sadece değişenleri gönder
echo "📤 Sadece değişiklikler gönderiliyor..."
git push origin main

echo "✅ Güncelleme tamam!"

