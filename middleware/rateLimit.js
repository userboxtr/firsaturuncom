const rateLimit = require('express-rate-limit');

// Genel API limiti
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: 1000,
    message: { error: 'Çok fazla istek gönderdiniz. 15 dakika sonra tekrar deneyin.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Auth endpoint limiti (brute-force koruması)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.' }
});

// Fırsat paylaşma limiti
const dealLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 saat
    max: 10,
    message: { error: 'Saatte en fazla 10 fırsat paylaşabilirsiniz.' }
});

// AI doğrulama limiti
const aiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 dakika
    max: 10,
    message: { error: 'AI doğrulama limiti aşıldı. Biraz bekleyin.' }
});

module.exports = { generalLimiter, authLimiter, dealLimiter, aiLimiter };
