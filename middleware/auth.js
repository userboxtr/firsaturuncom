const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // DB'den güncel durum kontrolü — banlı kullanıcıları engelle
        const db = getDb();
        const user = db.prepare('SELECT status, role FROM users WHERE id = ?').get(decoded.id);
        if (!user) return res.status(401).json({ error: 'Kullanıcı bulunamadı.' });
        if (user.status === 'banned') return res.status(403).json({ error: 'Hesabınız askıya alınmış.' });
        if (user.status === 'pending') return res.status(403).json({ error: 'Hesabınız henüz onaylanmadı. Admin onayı bekleniyor.' });

        req.user = { ...decoded, role: user.role, status: user.status };
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Oturum süresi dolmuş. Tekrar giriş yapın.' });
    }
}

// Opsiyonel auth - giriş yapmamış kullanıcılar da geçebilir
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
    } catch (err) {
        req.user = null;
    }
    next();
}

module.exports = { authMiddleware, optionalAuth };
