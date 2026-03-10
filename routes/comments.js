const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { getUserLevel } = require('../services/score-calculator');

const router = express.Router();

// Fırsata ait yorumları getir
router.get('/deal/:dealId', optionalAuth, (req, res) => {
    try {
        const db = getDb();
        const { dealId } = req.params;

        const comments = db.prepare(`
            SELECT c.*, u.username, u.avatar_url, u.points as user_points
            FROM comments c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE c.deal_id = ?
            ORDER BY c.created_at ASC
        `).all(dealId);

        // Kullanıcı seviyesi ekle
        comments.forEach(c => {
            c.userLevel = getUserLevel(c.user_points || 0);
        });

        // Threaded yapıya dönüştür
        const rootComments = [];
        const commentMap = {};

        comments.forEach(c => {
            c.replies = [];
            commentMap[c.id] = c;
        });

        comments.forEach(c => {
            if (c.parent_id && commentMap[c.parent_id]) {
                commentMap[c.parent_id].replies.push(c);
            } else {
                rootComments.push(c);
            }
        });

        res.json({ comments: rootComments, total: comments.length });
    } catch (err) {
        console.error('Yorum listeleme hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Yorum yaz
router.post('/', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const { deal_id, parent_id, content } = req.body;

        if (!content || content.trim().length < 2) {
            return res.status(400).json({ error: 'Yorum en az 2 karakter olmalı.' });
        }

        if (!deal_id) {
            return res.status(400).json({ error: 'Fırsat ID gerekli.' });
        }

        // Fırsat var mı kontrol
        const deal = db.prepare('SELECT id, user_id FROM deals WHERE id = ?').get(deal_id);
        if (!deal) return res.status(404).json({ error: 'Fırsat bulunamadı.' });

        // Parent yorum kontrolü
        if (parent_id) {
            const parentComment = db.prepare('SELECT id FROM comments WHERE id = ? AND deal_id = ?').get(parent_id, deal_id);
            if (!parentComment) return res.status(404).json({ error: 'Yanıtlanacak yorum bulunamadı.' });
        }

        const id = uuidv4();
        db.prepare(`
            INSERT INTO comments (id, deal_id, user_id, parent_id, content)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, deal_id, req.user.id, parent_id || null, content.trim());

        // Kullanıcıya puan ver
        db.prepare('UPDATE users SET points = points + 1 WHERE id = ?').run(req.user.id);

        // Fırsat sahibine bildirim
        if (deal.user_id !== req.user.id) {
            db.prepare(`
                INSERT INTO notifications (id, user_id, type, deal_id, from_user_id, message)
                VALUES (?, ?, 'comment', ?, ?, ?)
            `).run(uuidv4(), deal.user_id, deal_id, req.user.id,
                `${req.user.username} fırsatınıza yorum yaptı.`);
        }

        // Parent yorum sahibine bildirim
        if (parent_id) {
            const parentComment = db.prepare('SELECT user_id FROM comments WHERE id = ?').get(parent_id);
            if (parentComment && parentComment.user_id !== req.user.id) {
                db.prepare(`
                    INSERT INTO notifications (id, user_id, type, deal_id, from_user_id, message)
                    VALUES (?, ?, 'reply', ?, ?, ?)
                `).run(uuidv4(), parentComment.user_id, deal_id, req.user.id,
                    `${req.user.username} yorumunuzu yanıtladı.`);
            }
        }

        // Yeni yorumu kullanıcı bilgisiyle geri dön
        const newComment = db.prepare(`
            SELECT c.*, u.username, u.avatar_url, u.points as user_points
            FROM comments c LEFT JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
        `).get(id);
        newComment.userLevel = getUserLevel(newComment.user_points || 0);
        newComment.replies = [];

        res.status(201).json(newComment);
    } catch (err) {
        console.error('Yorum yazma hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Yorum düzenle
router.put('/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const { content } = req.body;

        if (!content || content.trim().length < 2) {
            return res.status(400).json({ error: 'Yorum en az 2 karakter olmalı.' });
        }

        const comment = db.prepare('SELECT * FROM comments WHERE id = ? AND user_id = ?')
            .get(req.params.id, req.user.id);
        if (!comment) return res.status(404).json({ error: 'Yorum bulunamadı veya yetkiniz yok.' });

        db.prepare('UPDATE comments SET content = ?, is_edited = 1 WHERE id = ?')
            .run(content.trim(), req.params.id);

        res.json({ message: 'Yorum güncellendi.' });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Yorum sil
router.delete('/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const comment = db.prepare('SELECT * FROM comments WHERE id = ? AND user_id = ?')
            .get(req.params.id, req.user.id);
        if (!comment) return res.status(404).json({ error: 'Yorum bulunamadı veya yetkiniz yok.' });

        db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
        res.json({ message: 'Yorum silindi.' });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

module.exports = router;
