const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { getUserLevel } = require('../services/score-calculator');

const router = express.Router();

// Kayıt
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Tüm alanları doldurun.' });
        }

        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: 'Kullanıcı adı 3-20 karakter olmalı.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı.' });
        }

        const db = getDb();

        // Kullanıcı adı/email kontrolü
        const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
        if (existing) {
            return res.status(409).json({ error: 'Bu kullanıcı adı veya e-posta zaten kullanılıyor.' });
        }

        const id = uuidv4();
        const passwordHash = await bcrypt.hash(password, 12);

        db.prepare(`
            INSERT INTO users (id, username, email, password_hash, status)
            VALUES (?, ?, ?, ?, 'pending')
        `).run(id, username, email, passwordHash);

        // Admin'e bildirim gönder
        try {
            const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
            for (const admin of admins) {
                db.prepare(`
                    INSERT INTO notifications (user_id, type, title, message)
                    VALUES (?, 'system', '👤 Yeni Üye Onayı', ?)
                `).run(admin.id, `${username} (${email}) üye onayı bekliyor.`);
            }
        } catch (e) { /* bildirim hatası sessiz geç */ }

        res.status(201).json({
            message: 'Kayıt başarılı! Hesabınız admin onayı bekliyor. Onaylandktan sonra giriş yapabilirsiniz.',
            pending: true
        });

    } catch (err) {
        console.error('Kayıt hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Giriş
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'E-posta ve şifre gerekli.' });
        }

        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (!user) {
            return res.status(401).json({ error: 'E-posta veya şifre hatalı.' });
        }

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'E-posta veya şifre hatalı.' });
        }

        // Admin onayı bekleyen kullanıcı
        if (user.status === 'pending') {
            return res.status(403).json({ error: 'Hesabınız henüz admin tarafından onaylanmadı. Lütfen bekleyin.' });
        }

        // Banlı kullanıcı
        if (user.status === 'banned') {
            return res.status(403).json({ error: 'Hesabınız askıya alınmış.' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        const levelInfo = getUserLevel(user.points);

        res.json({
            message: 'Giriş başarılı!',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                avatar_url: user.avatar_url,
                points: user.points,
                level: levelInfo
            }
        });

    } catch (err) {
        console.error('Giriş hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Profil bilgisi al
router.get('/me', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Token gerekli.' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const db = getDb();
        const user = db.prepare(`
            SELECT id, username, email, avatar_url, bio, city, points, level, role, created_at
            FROM users WHERE id = ?
        `).get(decoded.id);

        if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

        user.levelInfo = getUserLevel(user.points);

        // İstatistikleri çek
        const stats = db.prepare(`
            SELECT 
                (SELECT COUNT(*) FROM deals WHERE user_id = ?) as deal_count,
                (SELECT COALESCE(SUM(upvotes), 0) FROM deals WHERE user_id = ?) as total_upvotes,
                (SELECT COUNT(*) FROM comments WHERE user_id = ?) as comment_count
        `).get(user.id, user.id, user.id);

        user.stats = stats;

        res.json(user);
    } catch (err) {
        res.status(401).json({ error: 'Geçersiz token.' });
    }
});

// Şifre değiştir
const { authMiddleware } = require('../middleware/auth');
router.put('/password', authMiddleware, async (req, res) => {
    try {
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({ error: 'Mevcut ve yeni şifre gerekli.' });
        }

        if (new_password.length < 6) {
            return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalı.' });
        }

        const db = getDb();
        const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

        const isValid = await bcrypt.compare(current_password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Mevcut şifre hatalı.' });
        }

        const newHash = await bcrypt.hash(new_password, 12);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

        res.json({ message: 'Şifreniz başarıyla değiştirildi.' });
    } catch (err) {
        console.error('Şifre değiştirme hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

module.exports = router;
