require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const { initializeDatabase, closeDb } = require('./db/database');
const { generalLimiter, authLimiter, dealLimiter, aiLimiter } = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 3000;

// Güvenlik
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// CORS — env'den izinli domain'leri oku
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : null;
app.use(cors(allowedOrigins ? { origin: allowedOrigins } : {}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Statik dosyalar
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate limiting
app.use('/api/', generalLimiter);

// Routes
const authRoutes = require('./routes/auth');
const dealRoutes = require('./routes/deals');
const commentRoutes = require('./routes/comments');
const userRoutes = require('./routes/users');
const aiRoutes = require('./routes/ai');

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/deals', dealLimiter, dealRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);

// Rapor route
const reportRoutes = require('./routes/reports');
app.use('/api/reports', reportRoutes);

// Admin routes
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

// Görsel yükleme
const multer = require('multer');
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const name = `deal_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
        cb(null, name);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
        const allowedMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExt.includes(ext) && allowedMime.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Desteklenmeyen dosya formatı. JPG, PNG, GIF, WEBP kullanın.'));
        }
    }
});

const { authMiddleware } = require('./middleware/auth');

// Sharp opsiyonel — yoksa orijinal görsel kullanılır
let sharp;
try { sharp = require('sharp'); } catch (e) {
    console.warn('⚠️ Sharp yüklenemedi, görsel optimizasyonu devre dışı.');
}

app.post('/api/upload', authMiddleware, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Görsel yüklenemedi.' });

    try {
        if (sharp) {
            // Sharp ile optimize et: resize + WebP
            const optimizedName = req.file.filename.replace(/\.[^.]+$/, '.webp');
            const outputPath = path.join(__dirname, 'uploads', optimizedName);

            await sharp(req.file.path)
                .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 82 })
                .toFile(outputPath);

            // Orijinal dosyayı sil
            const fs = require('fs');
            if (req.file.path !== outputPath) {
                fs.unlink(req.file.path, () => { });
            }

            res.json({ url: `/uploads/${optimizedName}`, filename: optimizedName });
        } else {
            // Sharp yoksa orijinali kullan
            res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.filename });
        }
    } catch (err) {
        console.error('Görsel optimizasyon hatası:', err);
        // Optimize edilemezse orijinali kullan
        res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.filename });
    }
});

// Multer hata yakalayıcı
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Dosya en fazla 5MB olabilir.' });
        return res.status(400).json({ error: err.message });
    }
    if (err.message && err.message.includes('Desteklenmeyen')) return res.status(400).json({ error: err.message });
    next(err);
});

// Kategorileri getir
const { getDb } = require('./db/database');
app.get('/api/categories', (req, res) => {
    try {
        const db = getDb();
        const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// İstatistikler
app.get('/api/stats', (req, res) => {
    try {
        const db = getDb();
        const stats = db.prepare(`
            SELECT
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM deals WHERE status = 'active') as total_deals,
                (SELECT COUNT(*) FROM deals WHERE status = 'active' AND date(created_at) = date('now')) as today_deals,
                (SELECT COUNT(*) FROM comments) as total_comments
        `).get();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Rozetler API
const { getUserBadges } = require('./services/badge-service');
app.get('/api/badges/:userId', (req, res) => {
    try {
        const badges = getUserBadges(req.params.userId);
        res.json(badges);
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Kullanıcı takip API
app.post('/api/users/:id/follow', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const targetId = req.params.id;
        const userId = req.user.id;

        if (userId === targetId) {
            return res.status(400).json({ error: 'Kendinizi takip edemezsiniz.' });
        }

        // Kullanıcı var mı?
        const target = db.prepare('SELECT id, username FROM users WHERE id = ?').get(targetId);
        if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

        // Toggle
        const existing = db.prepare('SELECT id FROM user_user_follows WHERE follower_id = ? AND following_id = ?')
            .get(userId, targetId);

        if (existing) {
            db.prepare('DELETE FROM user_user_follows WHERE id = ?').run(existing.id);
            res.json({ followed: false, message: `@${target.username} takipten çıkarıldı.` });
        } else {
            db.prepare('INSERT INTO user_user_follows (follower_id, following_id) VALUES (?, ?)')
                .run(userId, targetId);

            // Bildirim gönder
            db.prepare(`
                INSERT INTO notifications (user_id, type, title, message)
                VALUES (?, 'follow', '👤 Yeni Takipçi', ?)
            `).run(targetId, `@${req.user.username} sizi takip etmeye başladı!`);

            res.json({ followed: true, message: `@${target.username} takip edildi!` });
        }
    } catch (err) {
        console.error('Takip hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Kullanıcının takipçi/takip sayısı
app.get('/api/users/:id/follow-stats', (req, res) => {
    try {
        const db = getDb();
        const userId = req.params.id;
        const followers = db.prepare('SELECT COUNT(*) as c FROM user_user_follows WHERE following_id = ?').get(userId)?.c || 0;
        const following = db.prepare('SELECT COUNT(*) as c FROM user_user_follows WHERE follower_id = ?').get(userId)?.c || 0;
        res.json({ followers, following });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Admin Analitik API
app.get('/api/admin/analytics', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ error: 'Yetkiniz yok.' });
        }

        // Son 7 gün verisi
        const dailyStats = db.prepare(`
            SELECT 
                date(created_at) as date,
                COUNT(*) as deal_count
            FROM deals
            WHERE created_at >= date('now', '-7 days')
            GROUP BY date(created_at)
            ORDER BY date ASC
        `).all();

        const dailyUsers = db.prepare(`
            SELECT 
                date(created_at) as date,
                COUNT(*) as user_count
            FROM users
            WHERE created_at >= date('now', '-7 days')
            GROUP BY date(created_at)
            ORDER BY date ASC
        `).all();

        const dailyComments = db.prepare(`
            SELECT 
                date(created_at) as date,
                COUNT(*) as comment_count
            FROM comments
            WHERE created_at >= date('now', '-7 days')
            GROUP BY date(created_at)
            ORDER BY date ASC
        `).all();

        // Top 5 mağaza
        const topStores = db.prepare(`
            SELECT store_name, COUNT(*) as count, COALESCE(SUM(upvotes), 0) as total_votes
            FROM deals
            WHERE store_name != '' AND store_name IS NOT NULL
            GROUP BY store_name
            ORDER BY count DESC
            LIMIT 5
        `).all();

        // Kategori dağılımı
        const categoryStats = db.prepare(`
            SELECT c.name, c.icon, COUNT(d.id) as count
            FROM categories c
            LEFT JOIN deals d ON d.category_id = c.id AND d.status = 'active'
            GROUP BY c.id
            ORDER BY count DESC
        `).all();

        // Genel istatistikler
        const overview = db.prepare(`
            SELECT
                (SELECT COUNT(*) FROM users WHERE status = 'active') as active_users,
                (SELECT COUNT(*) FROM users WHERE status = 'pending') as pending_users,
                (SELECT COUNT(*) FROM deals WHERE status = 'active') as active_deals,
                (SELECT COUNT(*) FROM reports WHERE status = 'pending') as pending_reports,
                (SELECT COALESCE(SUM(view_count), 0) FROM deals) as total_views
        `).get();

        res.json({
            dailyStats,
            dailyUsers,
            dailyComments,
            topStores,
            categoryStats,
            overview
        });
    } catch (err) {
        console.error('Analitik hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Yatırımcı başvuru API
app.post('/api/investor-apply', (req, res) => {
    try {
        const db = getDb();
        const { name, email, phone, company, message } = req.body;
        if (!name || !email || !message) {
            return res.status(400).json({ error: 'İsim, e-posta ve mesaj zorunludur.' });
        }
        db.prepare(`
            INSERT INTO investor_applications (name, email, phone, company, message)
            VALUES (?, ?, ?, ?, ?)
        `).run(name, email, phone || '', company || '', message);

        // Admin'e bildirim
        const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
        admins.forEach(admin => {
            db.prepare(`
                INSERT INTO notifications (id, user_id, type, message)
                VALUES (?, ?, 'investor', ?)
            `).run(require('crypto').randomUUID(), admin.id, `💰 Yeni yatırımcı başvurusu: ${name} (${email})`);
        });

        res.json({ success: true, message: 'Başvurunuz alındı! En kısa sürede dönüş yapacağız.' });
    } catch (err) {
        console.error('Yatırımcı başvuru hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Admin — yatırımcı başvuruları
app.get('/api/admin/investors', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
        if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Yetkiniz yok.' });

        const investors = db.prepare('SELECT * FROM investor_applications ORDER BY created_at DESC').all();
        res.json(investors);
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

app.put('/api/admin/investors/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
        if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Yetkiniz yok.' });

        const { status, admin_note } = req.body;
        db.prepare('UPDATE investor_applications SET status = ?, admin_note = ? WHERE id = ?')
            .run(status, admin_note || '', req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// Tema API (public — aktif temayı al)
app.get('/api/theme', (req, res) => {
    try {
        const db = getDb();
        const setting = db.prepare("SELECT value FROM site_settings WHERE key = 'theme_preset'").get();
        res.json({ theme: setting?.value || 'mint' });
    } catch (err) {
        res.json({ theme: 'mint' });
    }
});

// Sitemap.xml (SEO)
app.get('/sitemap.xml', (req, res) => {
    try {
        const db = getDb();
        const deals = db.prepare("SELECT id, created_at FROM deals WHERE status = 'active' ORDER BY created_at DESC LIMIT 1000").all();
        const host = `${req.protocol}://${req.get('host')}`;

        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
        xml += `  <url><loc>${host}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>\n`;
        for (const deal of deals) {
            xml += `  <url><loc>${host}/?deal=${deal.id}</loc><lastmod>${deal.created_at?.split(' ')[0] || ''}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
        }
        xml += `</urlset>`;

        res.set('Content-Type', 'application/xml');
        res.send(xml);
    } catch (err) {
        res.status(500).send('Sitemap error');
    }
});

// Link Scrape endpoint — URL'den ürün bilgilerini çek
const { scrapeUrl } = require('./services/scraper');
app.get('/api/scrape', authMiddleware, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL gerekli.' });

        // URL doğrulama
        try { new URL(url); } catch (e) {
            return res.status(400).json({ error: 'Geçersiz URL.' });
        }

        const data = await scrapeUrl(url);
        res.json(data);
    } catch (err) {
        console.error('Scrape hatası:', err.message);
        res.status(500).json({ error: 'Sayfa bilgileri alınamadı.' });
    }
});

// SPA fallback - tüm route'ları index.html'e yönlendir
app.get('{*path}', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint bulunamadı.' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Veritabanını başlat
initializeDatabase();

// Süresi dolmuş fırsatları otomatik tespit et (her saat)
function expireOldDeals() {
    try {
        const db = getDb();
        const result = db.prepare(`
            UPDATE deals SET status = 'expired', is_expired = 1
            WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < datetime('now')
        `).run();
        if (result.changes > 0) {
            console.log(`⏰ ${result.changes} fırsat süresi dolduğu için kapatıldı.`);
        }
    } catch (e) { /* silent */ }
}
expireOldDeals(); // Başlangıçta çalıştır
setInterval(expireOldDeals, 60 * 60 * 1000); // Her saat

// Sunucuyu başlat
const server = app.listen(PORT, () => {
    console.log(`\n🛒 FIRSAT ÜRÜN - firsaturun.com`);
    console.log(`✅ Sunucu çalışıyor: http://localhost:${PORT}`);
    console.log(`📅 ${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR')}\n`);
});

// Düzgün kapatma
process.on('SIGINT', () => {
    console.log('\n🛑 Sunucu kapatılıyor...');
    closeDb();
    server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
    closeDb();
    server.close(() => process.exit(0));
});
