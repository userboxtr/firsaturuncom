/**
 * FIRSAT ÜRÜN - Rapor Route'u
 * Kullanıcıların fırsatları/yorumları raporlaması
 */
const express = require('express');
const { getDb } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Rapor gönder
router.post('/', authMiddleware, (req, res) => {
    try {
        const { target_type, target_id, reason } = req.body;

        if (!target_type || !target_id || !reason) {
            return res.status(400).json({ error: 'Tüm alanları doldurun.' });
        }

        if (!['deal', 'comment', 'user'].includes(target_type)) {
            return res.status(400).json({ error: 'Geçersiz rapor türü.' });
        }

        if (reason.length < 5) {
            return res.status(400).json({ error: 'Rapor nedeni en az 5 karakter olmalı.' });
        }

        const db = getDb();

        // Aynı kullanıcı aynı hedefi tekrar raporlamasın
        const existing = db.prepare(
            'SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = ?'
        ).get(req.user.id, target_type, target_id, 'pending');

        if (existing) {
            return res.status(409).json({ error: 'Bu içeriği zaten raporladınız.' });
        }

        db.prepare(`
            INSERT INTO reports (reporter_id, target_type, target_id, reason)
            VALUES (?, ?, ?, ?)
        `).run(req.user.id, target_type, target_id, reason);

        // Admin'lere bildirim
        const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
        for (const admin of admins) {
            db.prepare(`
                INSERT INTO notifications (user_id, type, title, message)
                VALUES (?, 'system', '🚩 Yeni Rapor', ?)
            `).run(admin.id, `Bir ${target_type === 'deal' ? 'fırsat' : target_type === 'comment' ? 'yorum' : 'kullanıcı'} raporlandı: ${reason.substring(0, 50)}`);
        }

        res.status(201).json({ message: 'Rapor gönderildi. Teşekkürler!' });
    } catch (err) {
        console.error('Rapor hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

module.exports = router;
