/**
 * AI Fırsat Doğrulama Servisi
 * Katman 1: Kural Motoru (maliyet=0)
 * Katman 2: Gemini 2.0 Flash API (ücretsiz tier)
 */

// Bilinen güvenilir siteler
const TRUSTED_STORES = [
    'trendyol.com', 'hepsiburada.com', 'amazon.com.tr', 'n11.com',
    'mediamarkt.com.tr', 'teknosa.com', 'vatanbilgisayar.com',
    'a101.com.tr', 'bim.com.tr', 'sok.com.tr', 'migros.com.tr',
    'gratis.com', 'watsons.com.tr', 'koton.com', 'lcwaikiki.com',
    'defacto.com.tr', 'boyner.com.tr', 'morhipo.com',
    'getir.com', 'yemeksepeti.com', 'trendyolmilla.com',
    'apple.com', 'samsung.com', 'xiaomi.com.tr'
];

// Şüpheli siteler
const SUSPICIOUS_PATTERNS = [
    'bit.ly', 'tinyurl', 'shorturl', 'goo.gl',
    'telegram.me', 'wa.me'
];

/**
 * Katman 1: Kural Motoru
 */
function ruleEngineCheck(deal) {
    const warnings = [];
    const errors = [];
    let score = 10;

    // İndirim oranı kontrolü
    if (deal.discount_percent > 95) {
        errors.push('İndirim oranı %95\'ten fazla, bu genellikle dolandırıcılık belirtisi.');
        score -= 5;
    } else if (deal.discount_percent > 80) {
        warnings.push('Çok yüksek indirim oranı. Dikkatli olun.');
        score -= 2;
    }

    // Fiyat kontrolü
    if (deal.price && deal.price <= 0) {
        if (deal.deal_type !== 'free') {
            errors.push('Fiyat 0 veya negatif olamaz.');
            score -= 3;
        }
    }

    // Link kontrolü
    if (deal.link) {
        try {
            const url = new URL(deal.link);
            const domain = url.hostname.replace('www.', '');

            // Güvenilir site kontrolü
            const isTrusted = TRUSTED_STORES.some(s => domain.includes(s));
            if (isTrusted) {
                score += 1;
            }

            // Şüpheli link kontrolü
            const isSuspicious = SUSPICIOUS_PATTERNS.some(s => domain.includes(s));
            if (isSuspicious) {
                warnings.push('Kısaltılmış link kullanılmış. Orijinal link tercih edilmelidir.');
                score -= 2;
            }
        } catch (e) {
            warnings.push('Link formatı geçersiz.');
            score -= 1;
        }
    }

    // Sahte indirim öncesi fiyat kontrolü
    if (deal.old_price && deal.price) {
        if (deal.old_price < deal.price) {
            errors.push('Eski fiyat, yeni fiyattan düşük olamaz.');
            score -= 3;
        }
        const calcDiscount = Math.round((1 - deal.price / deal.old_price) * 100);
        if (deal.discount_percent && Math.abs(calcDiscount - deal.discount_percent) > 5) {
            warnings.push('Belirtilen indirim oranı hesaplanan ile uyuşmuyor.');
            score -= 1;
        }
    }

    score = Math.max(0, Math.min(10, score));

    return {
        passed: errors.length === 0,
        score,
        warnings,
        errors,
        needsAiVerification: errors.length === 0 && score < 8
    };
}

/**
 * Katman 2: Multi-Provider AI Doğrulama
 * DB settings'den sağlayıcı, API key ve model okunur.
 */
async function aiVerify(deal) {
    const { getDb } = require('../db/database');
    const db = getDb();

    // Settings'den AI yapılandırmasını oku
    const getSetting = (key) => {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return row ? row.value : '';
    };

    const provider = getSetting('ai_provider');
    const apiKey = getSetting('ai_api_key');
    const model = getSetting('ai_model');
    const localUrl = getSetting('ai_local_url') || 'http://localhost:11434';
    const aiEnabled = getSetting('ai_enabled');

    // AI kapalıysa veya sağlayıcı yoksa
    if (aiEnabled !== 'true' || !provider || provider === 'none') {
        return {
            verified: false,
            score: null,
            summary: 'AI doğrulama aktif değil. Admin panelinden etkinleştirin.',
            priceComparison: null
        };
    }

    const prompt = `Sen bir fırsat doğrulama uzmanısın. Aşağıdaki fırsatı değerlendir.

Fırsat Bilgileri:
- Ürün: ${deal.title}
- Fiyat: ${deal.price} TL
- Eski Fiyat: ${deal.old_price || 'Belirtilmemiş'} TL
- İndirim: %${deal.discount_percent || 'Belirtilmemiş'}
- Mağaza: ${deal.store_name || 'Belirtilmemiş'}
- Link: ${deal.link || 'Yok'}
- Tür: ${deal.deal_type}

Lütfen şunları yap:
1. Bu ürünün piyasa fiyatını araştır
2. Fırsatın gerçek bir indirim olup olmadığını değerlendir
3. Varsa diğer mağazalardaki fiyatları karşılaştır
4. 1-10 arası fırsat skoru ver
5. Kısa bir Türkçe değerlendirme yaz (max 2 cümle)

SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir şey yazma:
{
    "score": 8,
    "is_genuine_deal": true,
    "summary": "Değerlendirme özeti",
    "price_comparison": [
        {"store": "Mağaza Adı", "price": 1000}
    ],
    "warning": null
}`;

    try {
        let response;

        if (provider === 'gemini') {
            if (!apiKey) return noKeyResponse();
            response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
                    })
                }
            );
        } else if (provider === 'groq') {
            if (!apiKey) return noKeyResponse();
            response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model || 'llama-3.3-70b-versatile',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3,
                    max_tokens: 500
                })
            });
        } else if (provider === 'openai') {
            if (!apiKey) return noKeyResponse();
            response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model || 'gpt-4o-mini',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3,
                    max_tokens: 500
                })
            });
        } else if (provider === 'ollama') {
            response = await fetch(`${localUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model || 'llama3',
                    prompt: prompt,
                    stream: false,
                    options: { temperature: 0.3 }
                })
            });
        } else {
            return {
                verified: false, score: null,
                summary: `Bilinmeyen AI sağlayıcı: ${provider}`,
                priceComparison: null
            };
        }

        if (!response.ok) {
            const errText = await response.text();
            console.error(`${provider} API hatası:`, errText);
            return {
                verified: false, score: null,
                summary: `AI doğrulama şu an kullanılamıyor (${provider}).`,
                priceComparison: null
            };
        }

        const data = await response.json();

        // Yanıt metnini çıkar — sağlayıcıya göre farklı format
        let text = '';
        if (provider === 'gemini') {
            text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else if (provider === 'ollama') {
            text = data.response || '';
        } else {
            // OpenAI / Groq formatı
            text = data.choices?.[0]?.message?.content || '';
        }

        // JSON çıktısını parse et
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            return {
                verified: true,
                score: result.score,
                isGenuine: result.is_genuine_deal,
                summary: result.summary,
                priceComparison: result.price_comparison,
                warning: result.warning
            };
        }

        return {
            verified: true, score: null,
            summary: text.substring(0, 200),
            priceComparison: null
        };

    } catch (err) {
        console.error('AI doğrulama hatası:', err.message);
        return {
            verified: false, score: null,
            summary: 'AI doğrulama sırasında bir hata oluştu.',
            priceComparison: null
        };
    }
}

function noKeyResponse() {
    return {
        verified: false, score: null,
        summary: 'AI API anahtarı yapılandırılmamış. Admin panelinden ayarlayın.',
        priceComparison: null
    };
}

/**
 * Ana doğrulama fonksiyonu (hibrit)
 */
async function verifyDeal(deal) {
    // Katman 1: Kural motoru
    const ruleResult = ruleEngineCheck(deal);

    if (!ruleResult.passed) {
        return {
            status: 'rejected',
            ruleCheck: ruleResult,
            aiCheck: null,
            finalScore: ruleResult.score,
            summary: ruleResult.errors.join(' ')
        };
    }

    // Katman 2: AI doğrulama
    const aiResult = await aiVerify(deal);

    // Skorları birleştir
    const finalScore = aiResult.score
        ? Math.round((ruleResult.score * 0.4 + aiResult.score * 0.6) * 10) / 10
        : ruleResult.score;

    return {
        status: 'verified',
        ruleCheck: ruleResult,
        aiCheck: aiResult,
        finalScore,
        summary: aiResult.summary || 'Kural motoru kontrolünden geçti.'
    };
}

module.exports = { ruleEngineCheck, aiVerify, verifyDeal, TRUSTED_STORES };
