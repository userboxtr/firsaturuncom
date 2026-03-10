const express = require('express');
const { getDb } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { verifyDeal } = require('../services/ai-verifier');

const router = express.Router();

// Fırsat AI doğrulama
router.post('/verify', authMiddleware, async (req, res) => {
    try {
        const { deal_id } = req.body;

        if (!deal_id) {
            return res.status(400).json({ error: 'Fırsat ID gerekli.' });
        }

        const db = getDb();
        const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(deal_id);

        if (!deal) return res.status(404).json({ error: 'Fırsat bulunamadı.' });

        // Doğrulama yap
        const result = await verifyDeal(deal);

        // Sonucu veritabanına kaydet
        db.prepare(`
            UPDATE deals 
            SET ai_score = ?, ai_summary = ?, ai_verified_at = CURRENT_TIMESTAMP,
                ai_price_comparison = ?
            WHERE id = ?
        `).run(
            result.finalScore,
            result.summary,
            result.aiCheck?.priceComparison ? JSON.stringify(result.aiCheck.priceComparison) : null,
            deal_id
        );

        res.json({
            status: result.status,
            score: result.finalScore,
            summary: result.summary,
            ruleCheck: result.ruleCheck,
            aiCheck: result.aiCheck ? {
                verified: result.aiCheck.verified,
                score: result.aiCheck.score,
                summary: result.aiCheck.summary,
                priceComparison: result.aiCheck.priceComparison,
                warning: result.aiCheck.warning
            } : null
        });

    } catch (err) {
        console.error('AI doğrulama hatası:', err);
        res.status(500).json({ error: 'Doğrulama sırasında hata oluştu.' });
    }
});

// Fırsatın AI sonucunu getir
router.get('/result/:dealId', (req, res) => {
    try {
        const db = getDb();
        const deal = db.prepare(
            'SELECT ai_score, ai_summary, ai_verified_at, ai_price_comparison FROM deals WHERE id = ?'
        ).get(req.params.dealId);

        if (!deal) return res.status(404).json({ error: 'Fırsat bulunamadı.' });

        let priceComparison = null;
        if (deal.ai_price_comparison) {
            try { priceComparison = JSON.parse(deal.ai_price_comparison); }
            catch (e) { /* ignore */ }
        }

        res.json({
            score: deal.ai_score,
            summary: deal.ai_summary,
            verifiedAt: deal.ai_verified_at,
            priceComparison
        });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

module.exports = router;
