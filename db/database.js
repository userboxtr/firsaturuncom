const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'firsat-urun.db');

let db;

function getDb() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        db.pragma('busy_timeout = 5000');
    }
    return db;
}

function initializeDatabase() {
    const database = getDb();

    database.exec(`
        -- Kullanıcılar
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            google_id TEXT,
            avatar_url TEXT DEFAULT '',
            bio TEXT DEFAULT '',
            city TEXT DEFAULT '',
            points INTEGER DEFAULT 0,
            level TEXT DEFAULT 'caylak',
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Kategoriler
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            icon TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0
        );

        -- Fırsatlar
        CREATE TABLE IF NOT EXISTS deals (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            link TEXT,
            image_url TEXT,
            price REAL,
            old_price REAL,
            discount_percent INTEGER DEFAULT 0,
            store_name TEXT DEFAULT '',
            category_id INTEGER,
            deal_type TEXT DEFAULT 'online',
            coupon_code TEXT,
            expires_at DATETIME,
            city TEXT,
            is_expired INTEGER DEFAULT 0,
            upvotes INTEGER DEFAULT 0,
            downvotes INTEGER DEFAULT 0,
            hot_score REAL DEFAULT 0,
            ai_score REAL,
            ai_summary TEXT,
            ai_verified_at DATETIME,
            ai_price_comparison TEXT,
            status TEXT DEFAULT 'active',
            view_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        );

        -- Oylar
        CREATE TABLE IF NOT EXISTS votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            deal_id TEXT NOT NULL,
            vote_type INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, deal_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE
        );

        -- Yorumlar
        CREATE TABLE IF NOT EXISTS comments (
            id TEXT PRIMARY KEY,
            deal_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            parent_id TEXT,
            content TEXT NOT NULL,
            upvotes INTEGER DEFAULT 0,
            is_edited INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
        );

        -- Bildirimler
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            deal_id TEXT,
            from_user_id TEXT,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        -- Kullanıcı kategori takipleri
        CREATE TABLE IF NOT EXISTS user_follows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            category_id INTEGER,
            store_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        );

        -- Kullanıcı-kullanıcı takip
        CREATE TABLE IF NOT EXISTS user_user_follows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            follower_id TEXT NOT NULL,
            following_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(follower_id, following_id),
            FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_uuf_follower ON user_user_follows(follower_id);
        CREATE INDEX IF NOT EXISTS idx_uuf_following ON user_user_follows(following_id);

        -- Yatırımcı başvuruları
        CREATE TABLE IF NOT EXISTS investor_applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            company TEXT,
            message TEXT NOT NULL,
            status TEXT DEFAULT 'new',
            admin_note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- İndeksler
        CREATE INDEX IF NOT EXISTS idx_deals_category ON deals(category_id);
        CREATE INDEX IF NOT EXISTS idx_deals_user ON deals(user_id);
        CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
        CREATE INDEX IF NOT EXISTS idx_deals_hot_score ON deals(hot_score DESC);
        CREATE INDEX IF NOT EXISTS idx_deals_created ON deals(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_votes_deal ON votes(deal_id);
        CREATE INDEX IF NOT EXISTS idx_votes_user_deal ON votes(user_id, deal_id);
        CREATE INDEX IF NOT EXISTS idx_comments_deal ON comments(deal_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

        -- Favoriler
        CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            deal_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, deal_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);

        -- Rozetler
        CREATE TABLE IF NOT EXISTS badges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            icon TEXT NOT NULL,
            description TEXT DEFAULT '',
            condition_type TEXT NOT NULL,
            condition_value INTEGER DEFAULT 0
        );

        -- Kullanıcı rozetleri
        CREATE TABLE IF NOT EXISTS user_badges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            badge_id INTEGER NOT NULL,
            earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, badge_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE
        );
    `);

    // Kategorileri ekle (varsa ekleme)
    const categoryCount = database.prepare('SELECT COUNT(*) as c FROM categories').get();
    if (categoryCount.c === 0) {
        const insertCat = database.prepare('INSERT INTO categories (name, slug, icon, sort_order) VALUES (?, ?, ?, ?)');
        const categories = [
            ['Elektronik', 'elektronik', '💻', 1],
            ['Giyim & Moda', 'giyim-moda', '👕', 2],
            ['Süpermarket', 'supermarket', '🛒', 3],
            ['Oyun & Eğlence', 'oyun-eglence', '🎮', 4],
            ['Seyahat', 'seyahat', '✈️', 5],
            ['Ev & Yaşam', 'ev-yasam', '🏠', 6],
            ['Kozmetik & Bakım', 'kozmetik-bakim', '💄', 7],
            ['Yemek & İçecek', 'yemek-icecek', '🍔', 8],
            ['Kitap & Kırtasiye', 'kitap-kirtasiye', '📚', 9],
            ['Otomotiv', 'otomotiv', '🚗', 10],
            ['Sağlık & Spor', 'saglik-spor', '💊', 11],
            ['Ücretsiz', 'ucretsiz', '🆓', 12]
        ];

        const insertMany = database.transaction((cats) => {
            for (const cat of cats) insertCat.run(...cat);
        });
        insertMany(categories);
        console.log('✅ 12 kategori eklendi.');
    }

    // Migration: status sütunu ekle (mevcutsa görmezden gel)
    try { database.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'"); } catch (e) { /* already exists */ }

    // Migration: is_pinned sütunu ekle
    try { database.exec("ALTER TABLE deals ADD COLUMN is_pinned INTEGER DEFAULT 0"); } catch (e) { /* already exists */ }

    // Varsayılan rozetler
    const badgeCount = database.prepare('SELECT COUNT(*) as c FROM badges').get();
    if (badgeCount.c === 0) {
        const insertBadge = database.prepare('INSERT OR IGNORE INTO badges (code, name, icon, description, condition_type, condition_value) VALUES (?, ?, ?, ?, ?, ?)');
        const defaultBadges = [
            ['first_deal', 'İlk Fırsat', '🎯', 'İlk fırsatını paylaştın!', 'deal_count', 1],
            ['deal_hunter', 'Fırsat Avcısı', '🏹', '10 fırsat paylaştın', 'deal_count', 10],
            ['deal_master', 'Fırsat Ustası', '🎖️', '50 fırsat paylaştın', 'deal_count', 50],
            ['first_comment', 'İlk Yorum', '💬', 'İlk yorumunu yaptın', 'comment_count', 1],
            ['commentator', 'Yorumcu', '📝', '50 yorum yaptın', 'comment_count', 50],
            ['popular', 'Popüler', '⭐', 'Toplam 100 oy aldın', 'total_upvotes', 100],
            ['viral', 'Viral', '🔥', 'Toplam 500 oy aldın', 'total_upvotes', 500],
            ['veteran', 'Kıdemli', '🏅', '1000 puana ulaştın', 'points', 1000],
            ['legend', 'Efsane', '👑', '5000 puana ulaştın', 'points', 5000],
            ['helper', 'Yardımsever', '🤝', '25 yorum yaptın', 'comment_count', 25],
        ];
        for (const b of defaultBadges) insertBadge.run(...b);
        console.log('✅ 10 rozet tanımlandı.');
    }

    // Settings tablosu
    database.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            description TEXT DEFAULT '',
            category TEXT DEFAULT 'general',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Reports tablosu
    database.exec(`
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reporter_id TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            reason TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            admin_note TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            resolved_at DATETIME,
            FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    // Varsayılan ayarlar (yoksa ekle)
    const settingsCount = database.prepare('SELECT COUNT(*) as c FROM settings').get();
    if (settingsCount.c === 0) {
        const insertSetting = database.prepare('INSERT OR IGNORE INTO settings (key, value, description, category) VALUES (?, ?, ?, ?)');
        const defaults = [
            ['site_name', 'FIRSAT ÜRÜN', 'Site adı', 'general'],
            ['site_description', 'Türkiye\'nin en güvenilir fırsat paylaşım platformu', 'Site açıklaması', 'general'],
            ['maintenance_mode', 'false', 'Bakım modu aktif mi', 'general'],
            ['user_approval_required', 'false', 'Yeni üye kayıt onayı gerekli mi', 'general'],
            ['deal_approval_required', 'false', 'Fırsat paylaşımında onay gerekli mi', 'general'],
            ['ai_enabled', 'false', 'AI doğrulama aktif mi', 'ai'],
            ['ai_provider', 'none', 'AI sağlayıcı (none, groq, openai, gemini, ollama)', 'ai'],
            ['ai_api_key', '', 'AI API anahtarı', 'ai'],
            ['ai_model', '', 'AI model adı', 'ai'],
            ['ai_local_url', 'http://localhost:11434', 'Lokal AI (Ollama) URL', 'ai'],
            ['max_upload_size', '5', 'Maks. yükleme boyutu (MB)', 'general'],
            ['deals_per_page', '15', 'Sayfa başına fırsat', 'general'],
        ];
        for (const s of defaults) insertSetting.run(...s);
        console.log('✅ Varsayılan ayarlar eklendi.');
    }

    // İlk admin kullanıcı ata (mevcutsa güncelle)
    const adminUser = database.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
    if (!adminUser) {
        const bcrypt = require('bcryptjs');
        const { v4: uuidv4 } = require('uuid');
        const adminId = uuidv4();
        const hash = bcrypt.hashSync('admin123', 10);
        database.prepare(`
            INSERT OR IGNORE INTO users (id, username, email, password_hash, role, status, points)
            VALUES (?, 'admin', 'admin@firsaturun.com', ?, 'admin', 'active', 1000)
        `).run(adminId, hash);
        console.log('✅ Admin hesabı oluşturuldu: admin@firsaturun.com / admin123');
    }

    console.log('✅ Veritabanı hazır.');
    return database;
}

function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = { getDb, initializeDatabase, closeDb };
