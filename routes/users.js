const express = require('express');
const { getDb } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { getUserLevel } = require('../services/score-calculator');

const router = express.Router();

// Kullanıcı profili
router.get('/:username', (req, res) => {
    try {
        const db = getDb();
        const user = db.prepare(`
            SELECT id, username, avatar_url, bio, city, points, level, created_at
            FROM users WHERE username = ?
        `).get(req.params.username);

        if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

        user.levelInfo = getUserLevel(user.points);

        // İstatistikler
        const stats = db.prepare(`
            SELECT 
                (SELECT COUNT(*) FROM deals WHERE user_id = ? AND status = 'active') as deal_count,
                (SELECT COALESCE(SUM(upvotes), 0) FROM deals WHERE user_id = ?) as total_upvotes,
                (SELECT COUNT(*) FROM comments WHERE user_id = ?) as comment_count
        `).get(user.id, user.id, user.id);

        user.stats = stats;

        // Son fırsatları
        const recentDeals = db.prepare(`
            SELECT d.*, c.name as category_name, c.icon as category_icon,
                   (SELECT COUNT(*) FROM comments WHERE deal_id = d.id) as comment_count
            FROM deals d
            LEFT JOIN categories c ON d.category_id = c.id
            WHERE d.user_id = ? AND d.status = 'active'
            ORDER BY d.created_at DESC LIMIT 10
        `).all(user.id);

        user.recentDeals = recentDeals;

        res.json(user);
    } catch (err) {
        console.error('Profil hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Profil güncelle
router.put('/me/update', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const { bio, city, avatar_url } = req.body;

        db.prepare(`
            UPDATE users SET bio = ?, city = ?, avatar_url = ? WHERE id = ?
        `).run(bio || '', city || '', avatar_url || '', req.user.id);

        res.json({ message: 'Profil güncellendi.' });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Liderlik tablosu
router.get('/leaderboard/top', (req, res) => {
    try {
        const db = getDb();
        const users = db.prepare(`
            SELECT username, avatar_url, points,
                   (SELECT COUNT(*) FROM deals WHERE user_id = users.id AND status = 'active') as deal_count
            FROM users ORDER BY points DESC LIMIT 20
        `).all();

        users.forEach(u => {
            u.levelInfo = getUserLevel(u.points);
        });

        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Bildirimler
router.get('/me/notifications', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const notifications = db.prepare(`
            SELECT n.*, u.username as from_username, u.avatar_url as from_avatar
            FROM notifications n
            LEFT JOIN users u ON n.from_user_id = u.id
            WHERE n.user_id = ? AND n.type != 'investor'
            ORDER BY n.created_at DESC
            LIMIT 50
        `).all(req.user.id);

        const unreadCount = db.prepare(
            "SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0 AND type != 'investor'"
        ).get(req.user.id);

        res.json({ notifications, unread: unreadCount.c });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Bildirimleri okundu işaretle
router.put('/me/notifications/read', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
        res.json({ message: 'Bildirimler okundu.' });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

module.exports = router;
