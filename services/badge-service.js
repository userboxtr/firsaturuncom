/**
 * FIRSAT ÜRÜN - Rozet / Başarı Servisi
 * Kullanıcı istatistiklerine göre otomatik rozet ödüllendirmesi
 */
const { getDb } = require('../db/database');

/**
 * Kullanıcının istatistiklerini alıp hak ettiği yeni rozetleri ver
 */
function checkAndAwardBadges(userId) {
    const db = getDb();

    try {
        // Kullanıcının mevcut istatistikleri
        const stats = {
            deal_count: db.prepare('SELECT COUNT(*) as c FROM deals WHERE user_id = ?').get(userId)?.c || 0,
            comment_count: db.prepare('SELECT COUNT(*) as c FROM comments WHERE user_id = ?').get(userId)?.c || 0,
            total_upvotes: db.prepare('SELECT COALESCE(SUM(upvotes), 0) as c FROM deals WHERE user_id = ?').get(userId)?.c || 0,
            points: db.prepare('SELECT points FROM users WHERE id = ?').get(userId)?.points || 0
        };

        // Tüm rozetleri al
        const allBadges = db.prepare('SELECT * FROM badges').all();

        // Mevcut rozetleri al
        const earnedBadgeIds = db.prepare('SELECT badge_id FROM user_badges WHERE user_id = ?')
            .all(userId).map(b => b.badge_id);

        const newBadges = [];

        for (const badge of allBadges) {
            // Zaten kazanılmışsa geç
            if (earnedBadgeIds.includes(badge.id)) continue;

            // Koşul kontrolü
            const userValue = stats[badge.condition_type] || 0;
            if (userValue >= badge.condition_value) {
                // Rozet ver!
                db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)')
                    .run(userId, badge.id);

                // Bildirim gönder
                db.prepare(`
                    INSERT INTO notifications (user_id, type, title, message)
                    VALUES (?, 'system', '🏆 Yeni Rozet!', ?)
                `).run(userId, `${badge.icon} ${badge.name} rozetini kazandınız: ${badge.description}`);

                newBadges.push(badge);
            }
        }

        return newBadges;
    } catch (err) {
        console.error('Rozet kontrol hatası:', err.message);
        return [];
    }
}

/**
 * Kullanıcının tüm rozetlerini getir
 */
function getUserBadges(userId) {
    const db = getDb();
    return db.prepare(`
        SELECT b.*, ub.earned_at 
        FROM user_badges ub
        JOIN badges b ON b.id = ub.badge_id
        WHERE ub.user_id = ?
        ORDER BY ub.earned_at DESC
    `).all(userId);
}

module.exports = { checkAndAwardBadges, getUserBadges };
