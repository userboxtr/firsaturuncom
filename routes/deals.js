const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/database');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { calculateHotScore, getHeatLevel, getUserLevel } = require('../services/score-calculator');
const { checkAndAwardBadges } = require('../services/badge-service');

const router = express.Router();

// Görsel temizleme yardımcı fonksiyonu
function cleanupDealImage(imageUrl) {
    if (!imageUrl || !imageUrl.startsWith('/uploads/')) return;
    const filePath = path.join(__dirname, '..', imageUrl);
    fs.unlink(filePath, () => { }); // sessiz hata
}

// View count throttle — aynı IP son 1 saatte tekrar artırmasın
const viewedDeals = new Map(); // key: ip:dealId, value: timestamp
function canIncrementView(ip, dealId) {
    const key = `${ip}:${dealId}`;
    const lastView = viewedDeals.get(key);
    const now = Date.now();
    if (lastView && (now - lastView) < 3600000) return false; // 1 saat
    viewedDeals.set(key, now);
    // Bellek temizliği — 10000'den fazla kayıt birikmesin
    if (viewedDeals.size > 10000) {
        const cutoff = now - 3600000;
        for (const [k, v] of viewedDeals) {
            if (v < cutoff) viewedDeals.delete(k);
        }
    }
    return true;
}

// Fırsatları listele
router.get('/', optionalAuth, (req, res) => {
    try {
        const db = getDb();
        const {
            category, store, sort = 'hot', search,
            page = 1, limit = 20, deal_type, min_discount, min_ai_score,
            min_price, max_price, has_coupon
        } = req.query;

        let where = ['d.status = ?'];
        let params = ['active'];

        if (category) {
            where.push('c.slug = ?');
            params.push(category);
        }
        if (store) {
            where.push('d.store_name LIKE ?');
            params.push(`%${store}%`);
        }
        if (search) {
            where.push('(d.title LIKE ? OR d.description LIKE ? OR d.store_name LIKE ?)');
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (deal_type) {
            where.push('d.deal_type = ?');
            params.push(deal_type);
        }
        if (min_discount) {
            where.push('d.discount_percent >= ?');
            params.push(parseInt(min_discount));
        }
        if (min_ai_score) {
            where.push('d.ai_score >= ?');
            params.push(parseFloat(min_ai_score));
        }
        if (min_price) {
            where.push('d.price >= ?');
            params.push(parseFloat(min_price));
        }
        if (max_price) {
            where.push('d.price <= ?');
            params.push(parseFloat(max_price));
        }
        if (has_coupon === 'true') {
            where.push("d.coupon_code IS NOT NULL AND d.coupon_code != ''");
        }

        let orderBy = 'd.is_pinned DESC, d.hot_score DESC, d.created_at DESC';
        if (sort === 'new') orderBy = 'd.is_pinned DESC, d.created_at DESC';
        if (sort === 'comments') orderBy = 'd.is_pinned DESC, comment_count DESC, d.created_at DESC';
        if (sort === 'ai') orderBy = 'd.is_pinned DESC, d.ai_score DESC NULLS LAST, d.created_at DESC';
        if (sort === 'discount') orderBy = 'd.is_pinned DESC, d.discount_percent DESC, d.created_at DESC';

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const deals = db.prepare(`
            SELECT d.*, c.name as category_name, c.slug as category_slug, c.icon as category_icon,
                   u.username, u.avatar_url, u.points as user_points,
                   (SELECT COUNT(*) FROM comments WHERE deal_id = d.id) as comment_count
                   ${req.user ? ', (SELECT vote_type FROM votes WHERE user_id = ? AND deal_id = d.id) as user_vote' : ''}
            FROM deals d
            LEFT JOIN categories c ON d.category_id = c.id
            LEFT JOIN users u ON d.user_id = u.id
            WHERE ${where.join(' AND ')}
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?
        `).all(...(req.user ? [req.user.id, ...params] : params), parseInt(limit), offset);

        // Sıcaklık bilgisi ekle
        deals.forEach(deal => {
            deal.heat = getHeatLevel(deal.hot_score);
            deal.userLevel = getUserLevel(deal.user_points || 0);
            if (deal.ai_price_comparison) {
                try { deal.ai_price_comparison = JSON.parse(deal.ai_price_comparison); }
                catch (e) { /* ignore */ }
            }
        });

        const totalRow = db.prepare(`
            SELECT COUNT(*) as total FROM deals d
            LEFT JOIN categories c ON d.category_id = c.id
            WHERE ${where.join(' AND ')}
        `).get(...params);

        res.json({
            deals,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalRow.total,
                totalPages: Math.ceil(totalRow.total / parseInt(limit))
            }
        });

    } catch (err) {
        console.error('Fırsat listeleme hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Tek fırsat detayı
router.get('/:id', optionalAuth, (req, res) => {
    try {
        const db = getDb();

        const deal = db.prepare(`
            SELECT d.*, c.name as category_name, c.slug as category_slug, c.icon as category_icon,
                   u.username, u.avatar_url, u.points as user_points, u.bio as user_bio
                   ${req.user ? ', (SELECT vote_type FROM votes WHERE user_id = ? AND deal_id = d.id) as user_vote' : ''}
            FROM deals d
            LEFT JOIN categories c ON d.category_id = c.id
            LEFT JOIN users u ON d.user_id = u.id
            WHERE d.id = ?
        `).get(...(req.user ? [req.user.id, req.params.id] : [req.params.id]));

        if (!deal) return res.status(404).json({ error: 'Fırsat bulunamadı.' });

        deal.heat = getHeatLevel(deal.hot_score);
        deal.userLevel = getUserLevel(deal.user_points || 0);
        if (deal.ai_price_comparison) {
            try { deal.ai_price_comparison = JSON.parse(deal.ai_price_comparison); }
            catch (e) { /* ignore */ }
        }

        // Görüntülenme sayısını artır (throttle)
        const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
        if (canIncrementView(clientIp, req.params.id)) {
            db.prepare('UPDATE deals SET view_count = view_count + 1 WHERE id = ?').run(req.params.id);
        }

        res.json(deal);
    } catch (err) {
        console.error('Fırsat detay hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Fırsat paylaş
router.post('/', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const {
            title, description, link, image_url, price, old_price,
            discount_percent, store_name, category_id, deal_type,
            coupon_code, expires_at, city
        } = req.body;

        if (!title || title.length < 5) {
            return res.status(400).json({ error: 'Başlık en az 5 karakter olmalı.' });
        }

        // İndirim oranını hesapla
        let calcDiscount = discount_percent || 0;
        if (old_price && price && old_price > price) {
            calcDiscount = Math.round((1 - price / old_price) * 100);
        }

        const id = uuidv4();

        db.prepare(`
            INSERT INTO deals (id, user_id, title, description, link, image_url, price, old_price,
                             discount_percent, store_name, category_id, deal_type,
                             coupon_code, expires_at, city, hot_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(id, req.user.id, title, description || '', link || null, image_url || null,
            price || null, old_price || null, calcDiscount,
            store_name || '', category_id || null, deal_type || 'online',
            coupon_code || null, expires_at || null, city || null);

        // Kullanıcıya puan ver
        db.prepare('UPDATE users SET points = points + 5 WHERE id = ?').run(req.user.id);

        // Rozet kontrolü
        checkAndAwardBadges(req.user.id);

        res.status(201).json({ message: 'Fırsat paylaşıldı!', id });

    } catch (err) {
        console.error('Fırsat paylaşma hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Oy ver
router.post('/:id/vote', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const { vote_type } = req.body; // 1 veya -1
        const dealId = req.params.id;
        const userId = req.user.id;

        if (vote_type !== 1 && vote_type !== -1) {
            return res.status(400).json({ error: 'Geçersiz oy.' });
        }

        const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(dealId);
        if (!deal) return res.status(404).json({ error: 'Fırsat bulunamadı.' });

        // Kendi fırsatına oy vermeyi engelle
        if (deal.user_id === userId) {
            return res.status(400).json({ error: 'Kendi fırsatınıza oy veremezsiniz.' });
        }

        const existing = db.prepare('SELECT * FROM votes WHERE user_id = ? AND deal_id = ?').get(userId, dealId);

        const updateDeal = db.transaction(() => {
            if (existing) {
                if (existing.vote_type === vote_type) {
                    // Aynı oy → oyu geri çek
                    db.prepare('DELETE FROM votes WHERE id = ?').run(existing.id);
                    if (vote_type === 1) {
                        db.prepare('UPDATE deals SET upvotes = upvotes - 1 WHERE id = ?').run(dealId);
                        db.prepare('UPDATE users SET points = points - 2 WHERE id = ?').run(deal.user_id);
                    } else {
                        db.prepare('UPDATE deals SET downvotes = downvotes - 1 WHERE id = ?').run(dealId);
                    }
                } else {
                    // Farklı oy → değiştir
                    db.prepare('UPDATE votes SET vote_type = ? WHERE id = ?').run(vote_type, existing.id);
                    if (vote_type === 1) {
                        db.prepare('UPDATE deals SET upvotes = upvotes + 1, downvotes = downvotes - 1 WHERE id = ?').run(dealId);
                        db.prepare('UPDATE users SET points = points + 4 WHERE id = ?').run(deal.user_id);
                    } else {
                        db.prepare('UPDATE deals SET upvotes = upvotes - 1, downvotes = downvotes + 1 WHERE id = ?').run(dealId);
                        db.prepare('UPDATE users SET points = points - 4 WHERE id = ?').run(deal.user_id);
                    }
                }
            } else {
                // Yeni oy
                db.prepare('INSERT INTO votes (user_id, deal_id, vote_type) VALUES (?, ?, ?)').run(userId, dealId, vote_type);
                if (vote_type === 1) {
                    db.prepare('UPDATE deals SET upvotes = upvotes + 1 WHERE id = ?').run(dealId);
                    db.prepare('UPDATE users SET points = points + 2 WHERE id = ?').run(deal.user_id);
                } else {
                    db.prepare('UPDATE deals SET downvotes = downvotes + 1 WHERE id = ?').run(dealId);
                }
            }

            // Hot score güncelle
            const updated = db.prepare('SELECT upvotes, downvotes, created_at FROM deals WHERE id = ?').get(dealId);
            const hotScore = calculateHotScore(updated.upvotes, updated.downvotes, updated.created_at);
            db.prepare('UPDATE deals SET hot_score = ? WHERE id = ?').run(hotScore, dealId);

            // Güncel durumu al
            return db.prepare('SELECT upvotes, downvotes, hot_score FROM deals WHERE id = ?').get(dealId);
        });

        const result = updateDeal();
        const userVote = db.prepare('SELECT vote_type FROM votes WHERE user_id = ? AND deal_id = ?').get(userId, dealId);

        res.json({
            upvotes: result.upvotes,
            downvotes: result.downvotes,
            hot_score: result.hot_score,
            heat: getHeatLevel(result.hot_score),
            user_vote: userVote ? userVote.vote_type : null
        });

    } catch (err) {
        console.error('Oylama hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Fırsat düzenleme (sadece sahibi)
router.put('/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const deal = db.prepare('SELECT * FROM deals WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!deal) return res.status(404).json({ error: 'Fırsat bulunamadı veya yetkiniz yok.' });

        const {
            title, description, link, image_url, price, old_price,
            discount_percent, store_name, category_id, deal_type,
            coupon_code, expires_at, city
        } = req.body;

        if (!title || title.length < 5) {
            return res.status(400).json({ error: 'Başlık en az 5 karakter olmalı.' });
        }

        let calcDiscount = discount_percent || 0;
        if (old_price && price && old_price > price) {
            calcDiscount = Math.round((1 - price / old_price) * 100);
        }

        // Eski görseli temizle (yeni görsel varsa)
        if (image_url && deal.image_url && image_url !== deal.image_url) {
            cleanupDealImage(deal.image_url);
        }

        db.prepare(`
            UPDATE deals SET title = ?, description = ?, link = ?, image_url = ?,
                price = ?, old_price = ?, discount_percent = ?, store_name = ?,
                category_id = ?, deal_type = ?, coupon_code = ?, expires_at = ?, city = ?
            WHERE id = ?
        `).run(
            title, description || '', link || null, image_url || deal.image_url,
            price || null, old_price || null, calcDiscount,
            store_name || '', category_id || null, deal_type || 'online',
            coupon_code || null, expires_at || null, city || null,
            req.params.id
        );

        res.json({ message: 'Fırsat güncellendi.' });
    } catch (err) {
        console.error('Fırsat düzenleme hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Fırsat sil (sadece sahibi)
router.delete('/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const deal = db.prepare('SELECT * FROM deals WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!deal) return res.status(404).json({ error: 'Fırsat bulunamadı veya yetkiniz yok.' });

        // Görseli temizle
        cleanupDealImage(deal.image_url);

        db.prepare('DELETE FROM deals WHERE id = ?').run(req.params.id);
        res.json({ message: 'Fırsat silindi.' });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Favori toggle
router.post('/:id/favorite', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const dealId = req.params.id;
        const userId = req.user.id;

        const deal = db.prepare('SELECT id FROM deals WHERE id = ?').get(dealId);
        if (!deal) return res.status(404).json({ error: 'Fırsat bulunamadı.' });

        const existing = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND deal_id = ?').get(userId, dealId);
        if (existing) {
            db.prepare('DELETE FROM favorites WHERE id = ?').run(existing.id);
            res.json({ favorited: false, message: 'Favorilerden çıkarıldı.' });
        } else {
            db.prepare('INSERT INTO favorites (user_id, deal_id) VALUES (?, ?)').run(userId, dealId);
            res.json({ favorited: true, message: 'Favorilere eklendi!' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

module.exports = router;
