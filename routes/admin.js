const express = require('express');
const { getDb } = require('../db/database');
const { adminMiddleware } = require('../middleware/admin');
const { getUserLevel } = require('../services/score-calculator');

const router = express.Router();

// Tüm admin route'larını admin middleware ile koru
router.use(adminMiddleware);

// ═══════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════
router.get('/dashboard', (req, res) => {
    try {
        const db = getDb();

        const stats = db.prepare(`
            SELECT
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM users WHERE status = 'pending') as pending_users,
                (SELECT COUNT(*) FROM users WHERE status = 'banned') as banned_users,
                (SELECT COUNT(*) FROM users WHERE date(created_at) = date('now')) as today_users,
                (SELECT COUNT(*) FROM deals WHERE status = 'active') as total_deals,
                (SELECT COUNT(*) FROM deals WHERE status = 'pending') as pending_deals,
                (SELECT COUNT(*) FROM deals WHERE status = 'active' AND date(created_at) = date('now')) as today_deals,
                (SELECT COUNT(*) FROM comments) as total_comments,
                (SELECT COUNT(*) FROM comments WHERE date(created_at) = date('now')) as today_comments,
                (SELECT COUNT(*) FROM votes) as total_votes,
                (SELECT COUNT(*) FROM reports WHERE status = 'pending') as pending_reports
        `).get();

        // Son aktiviteler
        const recentActivity = db.prepare(`
            SELECT 'deal' as type, d.title as text, u.username, d.created_at
            FROM deals d JOIN users u ON d.user_id = u.id
            ORDER BY d.created_at DESC LIMIT 5
        `).all();

        const recentUsers = db.prepare(`
            SELECT username, email, role, status, points, created_at
            FROM users ORDER BY created_at DESC LIMIT 5
        `).all();

        // Son 7 gün trendi
        const dailyTrend = db.prepare(`
            SELECT date(created_at) as day,
                   COUNT(*) as deal_count
            FROM deals
            WHERE created_at >= datetime('now', '-7 days')
            GROUP BY date(created_at)
            ORDER BY day ASC
        `).all();

        res.json({ stats, recentActivity, recentUsers, dailyTrend });
    } catch (err) {
        console.error('Dashboard hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// ═══════════════════════════════════════
// ÜYE YÖNETİMİ
// ═══════════════════════════════════════
router.get('/users', (req, res) => {
    try {
        const db = getDb();
        const { status, role, search, page = 1, limit = 20 } = req.query;

        let where = ['1=1'];
        let params = [];

        if (status) { where.push('u.status = ?'); params.push(status); }
        if (role) { where.push('u.role = ?'); params.push(role); }
        if (search) {
            where.push('(u.username LIKE ? OR u.email LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const users = db.prepare(`
            SELECT u.id, u.username, u.email, u.role, u.status, u.points, u.level,
                   u.avatar_url, u.bio, u.city, u.created_at,
                   (SELECT COUNT(*) FROM deals WHERE user_id = u.id) as deal_count,
                   (SELECT COUNT(*) FROM comments WHERE user_id = u.id) as comment_count
            FROM users u
            WHERE ${where.join(' AND ')}
            ORDER BY u.created_at DESC
            LIMIT ? OFFSET ?
        `).all(...params, parseInt(limit), offset);

        users.forEach(u => u.levelInfo = getUserLevel(u.points));

        const total = db.prepare(`SELECT COUNT(*) as c FROM users u WHERE ${where.join(' AND ')}`).get(...params);

        res.json({ users, total: total.c, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        console.error('Üye listeme hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Üye durumunu güncelle (onayla, banla, aktif yap)
router.put('/users/:id/status', (req, res) => {
    try {
        const db = getDb();
        const { status } = req.body; // active, pending, banned

        if (!['active', 'pending', 'banned'].includes(status)) {
            return res.status(400).json({ error: 'Geçersiz durum.' });
        }

        // Admin kendini banlayamasın
        if (req.params.id === req.user.id && status === 'banned') {
            return res.status(400).json({ error: 'Kendinizi banlayamazsınız.' });
        }

        db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.params.id);
        res.json({ message: `Kullanıcı durumu "${status}" olarak güncellendi.` });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Üye rolünü güncelle
router.put('/users/:id/role', (req, res) => {
    try {
        const db = getDb();
        const { role } = req.body; // user, moderator, admin

        if (!['user', 'moderator', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Geçersiz rol.' });
        }

        if (req.params.id === req.user.id) {
            return res.status(400).json({ error: 'Kendi rolünüzü değiştiremezsiniz.' });
        }

        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
        res.json({ message: `Rol "${role}" olarak güncellendi.` });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Üye sil
router.delete('/users/:id', (req, res) => {
    try {
        const db = getDb();

        if (req.params.id === req.user.id) {
            return res.status(400).json({ error: 'Kendinizi silemezsiniz.' });
        }

        const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.params.id);
        if (user && user.role === 'admin') {
            return res.status(400).json({ error: 'Admin kullanıcı silinemez.' });
        }

        db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
        res.json({ message: 'Kullanıcı silindi.' });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// ═══════════════════════════════════════
// FIRSAT YÖNETİMİ
// ═══════════════════════════════════════
router.get('/deals', (req, res) => {
    try {
        const db = getDb();
        const { status, search, page = 1, limit = 20 } = req.query;

        let where = ['1=1'];
        let params = [];

        if (status) { where.push('d.status = ?'); params.push(status); }
        if (search) {
            where.push('(d.title LIKE ? OR d.store_name LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const deals = db.prepare(`
            SELECT d.*, u.username, c.name as category_name, c.icon as category_icon,
                   (SELECT COUNT(*) FROM comments WHERE deal_id = d.id) as comment_count
            FROM deals d
            LEFT JOIN users u ON d.user_id = u.id
            LEFT JOIN categories c ON d.category_id = c.id
            WHERE ${where.join(' AND ')}
            ORDER BY d.created_at DESC
            LIMIT ? OFFSET ?
        `).all(...params, parseInt(limit), offset);

        const total = db.prepare(`
            SELECT COUNT(*) as c FROM deals d WHERE ${where.join(' AND ')}
        `).get(...params);

        res.json({ deals, total: total.c, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        console.error('Fırsat listeleme hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Fırsat durumunu güncelle
router.put('/deals/:id/status', (req, res) => {
    try {
        const db = getDb();
        const { status } = req.body; // active, pending, rejected, expired

        if (!['active', 'pending', 'rejected', 'expired'].includes(status)) {
            return res.status(400).json({ error: 'Geçersiz durum.' });
        }

        db.prepare('UPDATE deals SET status = ? WHERE id = ?').run(status, req.params.id);
        res.json({ message: `Fırsat durumu "${status}" olarak güncellendi.` });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Fırsat sil (admin)
router.delete('/deals/:id', (req, res) => {
    try {
        const db = getDb();
        const deal = db.prepare('SELECT image_url FROM deals WHERE id = ?').get(req.params.id);

        // Görseli fiziksel olarak sil
        if (deal && deal.image_url && deal.image_url.startsWith('/uploads/')) {
            const filePath = require('path').join(__dirname, '..', deal.image_url);
            require('fs').unlink(filePath, () => { });
        }

        db.prepare('DELETE FROM deals WHERE id = ?').run(req.params.id);
        res.json({ message: 'Fırsat silindi.' });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});
// ═══════════════════════════════════════
// FIRSAT SABİTLE / KALDIR (PIN/UNPIN)
// ═══════════════════════════════════════
router.put('/deals/:id/pin', (req, res) => {
    try {
        const db = getDb();
        const deal = db.prepare('SELECT is_pinned FROM deals WHERE id = ?').get(req.params.id);
        if (!deal) return res.status(404).json({ error: 'Fırsat bulunamadı.' });

        const newState = deal.is_pinned ? 0 : 1;
        db.prepare('UPDATE deals SET is_pinned = ? WHERE id = ?').run(newState, req.params.id);
        res.json({ message: newState ? 'Fırsat sabitlendi.' : 'Sabitleme kaldırıldı.', is_pinned: newState });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// ═══════════════════════════════════════
// RAPORLAR
// ═══════════════════════════════════════
router.get('/reports', (req, res) => {
    try {
        const db = getDb();
        const { status = 'pending' } = req.query;
        const reports = db.prepare(`
            SELECT r.*, u.username as reporter_username
            FROM reports r
            LEFT JOIN users u ON r.reporter_id = u.id
            WHERE r.status = ?
            ORDER BY r.created_at DESC
        `).all(status);
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

router.put('/reports/:id', (req, res) => {
    try {
        const db = getDb();
        const { status, admin_note } = req.body;
        db.prepare('UPDATE reports SET status = ?, admin_note = ?, resolved_at = datetime(?) WHERE id = ?')
            .run(status, admin_note || '', 'now', req.params.id);
        res.json({ message: 'Rapor güncellendi.' });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// ═══════════════════════════════════════
// AYARLAR
// ═══════════════════════════════════════
router.get('/settings', (req, res) => {
    try {
        const db = getDb();
        const settings = db.prepare('SELECT * FROM settings ORDER BY category, key').all();

        // API key'i maskele
        const masked = settings.map(s => ({
            ...s,
            value: s.key === 'ai_api_key' && s.value ? '••••••' + s.value.slice(-4) : s.value
        }));

        res.json(masked);
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Ayar güncelle
router.put('/settings', (req, res) => {
    try {
        const db = getDb();
        const { settings } = req.body; // [{key, value}, ...]

        if (!Array.isArray(settings)) {
            return res.status(400).json({ error: 'Geçersiz format.' });
        }

        const update = db.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?');
        const updateMany = db.transaction((items) => {
            for (const item of items) {
                // API key boş gelirse mevcut değeri koru
                if (item.key === 'ai_api_key' && (!item.value || item.value.includes('••••'))) continue;
                update.run(item.value, item.key);
            }
        });
        updateMany(settings);

        res.json({ message: 'Ayarlar güncellendi.' });
    } catch (err) {
        console.error('Ayar güncelleme hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// ═══════════════════════════════════════
// KATEGORİ YÖNETİMİ
// ═══════════════════════════════════════
router.post('/categories', (req, res) => {
    try {
        const db = getDb();
        const { name, slug, icon, sort_order } = req.body;

        if (!name || !slug) return res.status(400).json({ error: 'Ad ve slug zorunlu.' });

        db.prepare('INSERT INTO categories (name, slug, icon, sort_order) VALUES (?, ?, ?, ?)')
            .run(name, slug, icon || '', sort_order || 0);

        res.json({ message: 'Kategori eklendi.' });
    } catch (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Bu slug zaten var.' });
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

router.put('/categories/:id', (req, res) => {
    try {
        const db = getDb();
        const { name, slug, icon, sort_order } = req.body;

        db.prepare('UPDATE categories SET name = ?, slug = ?, icon = ?, sort_order = ? WHERE id = ?')
            .run(name, slug, icon || '', sort_order || 0, req.params.id);

        res.json({ message: 'Kategori güncellendi.' });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

router.delete('/categories/:id', (req, res) => {
    try {
        const db = getDb();
        const deals = db.prepare('SELECT COUNT(*) as c FROM deals WHERE category_id = ?').get(req.params.id);
        if (deals.c > 0) return res.status(400).json({ error: `Bu kategoride ${deals.c} fırsat var. Önce fırsatları taşıyın.` });

        db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
        res.json({ message: 'Kategori silindi.' });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// ═══════════════════════════════════════
// YORUM MODERASYONu
// ═══════════════════════════════════════
router.get('/comments', (req, res) => {
    try {
        const db = getDb();
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const comments = db.prepare(`
            SELECT c.*, u.username, d.title as deal_title
            FROM comments c
            LEFT JOIN users u ON c.user_id = u.id
            LEFT JOIN deals d ON c.deal_id = d.id
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `).all(parseInt(limit), offset);

        const total = db.prepare('SELECT COUNT(*) as c FROM comments').get();
        res.json({ comments, total: total.c });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

router.delete('/comments/:id', (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
        res.json({ message: 'Yorum silindi.' });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// ═══════════════════════════════════════
// AI TEST
// ═══════════════════════════════════════
router.post('/ai/test', async (req, res) => {
    try {
        const db = getDb();
        const provider = db.prepare("SELECT value FROM settings WHERE key = 'ai_provider'").get();
        const apiKey = db.prepare("SELECT value FROM settings WHERE key = 'ai_api_key'").get();
        const model = db.prepare("SELECT value FROM settings WHERE key = 'ai_model'").get();
        const localUrl = db.prepare("SELECT value FROM settings WHERE key = 'ai_local_url'").get();

        if (!provider || provider.value === 'none') {
            return res.json({ success: false, message: 'AI sağlayıcı seçilmemiş.' });
        }

        if (provider.value === 'ollama') {
            // Ollama bağlantı testi
            try {
                const response = await fetch(`${localUrl?.value || 'http://localhost:11434'}/api/tags`);
                const data = await response.json();
                return res.json({
                    success: true,
                    message: `Ollama bağlantısı başarılı! ${data.models?.length || 0} model bulundu.`,
                    models: data.models?.map(m => m.name) || []
                });
            } catch (e) {
                return res.json({ success: false, message: `Ollama bağlantı hatası: ${e.message}` });
            }
        }

        // API sağlayıcılar için basit test
        const endpoints = {
            groq: 'https://api.groq.com/openai/v1/models',
            openai: 'https://api.openai.com/v1/models',
            gemini: 'https://generativelanguage.googleapis.com/v1/models'
        };

        const url = endpoints[provider.value];
        if (!url) return res.json({ success: false, message: 'Bilinmeyen sağlayıcı.' });

        try {
            const headers = {};
            if (provider.value === 'gemini') {
                // Gemini uses URL param
            } else {
                headers['Authorization'] = `Bearer ${apiKey?.value || ''}`;
            }

            const testUrl = provider.value === 'gemini'
                ? `${url}?key=${apiKey?.value || ''}`
                : url;

            const response = await fetch(testUrl, { headers });

            if (response.ok) {
                return res.json({ success: true, message: `${provider.value} API bağlantısı başarılı!` });
            } else {
                const err = await response.json().catch(() => ({}));
                return res.json({ success: false, message: `API hatası (${response.status}): ${err.error?.message || 'Bilinmeyen hata'}` });
            }
        } catch (e) {
            return res.json({ success: false, message: `Bağlantı hatası: ${e.message}` });
        }
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

module.exports = router;
