const { authMiddleware } = require('./auth');
const { getDb } = require('../db/database');

// Admin middleware — sadece admin rolü erişebilir
function adminMiddleware(req, res, next) {
    // Önce auth kontrolü
    authMiddleware(req, res, () => {
        if (!req.user) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });

        // Veritabanından güncel role al (JWT'de role yok)
        const db = getDb();
        const user = db.prepare('SELECT role, status FROM users WHERE id = ?').get(req.user.id);

        if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        if (user.status === 'banned') return res.status(403).json({ error: 'Hesabınız askıya alınmış.' });
        if (user.role !== 'admin') return res.status(403).json({ error: 'Yetkiniz yok. Sadece admin erişebilir.' });

        req.user.role = user.role;
        req.user.status = user.status;
        next();
    });
}

// Admin veya Moderatör
function modMiddleware(req, res, next) {
    authMiddleware(req, res, () => {
        if (!req.user) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });

        const db = getDb();
        const user = db.prepare('SELECT role, status FROM users WHERE id = ?').get(req.user.id);

        if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        if (user.status === 'banned') return res.status(403).json({ error: 'Hesabınız askıya alınmış.' });
        if (!['admin', 'moderator'].includes(user.role)) return res.status(403).json({ error: 'Yetkiniz yok.' });

        req.user.role = user.role;
        req.user.status = user.status;
        next();
    });
}

module.exports = { adminMiddleware, modMiddleware };
