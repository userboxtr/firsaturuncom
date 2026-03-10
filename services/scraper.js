/**
 * FIRSAT ÜRÜN - URL Scraper Servisi
 * Ürün linkinden otomatik bilgi çekme (Open Graph, JSON-LD, site-özel parser)
 */

const cheerio = require('cheerio');

// User-Agent rotasyonu — bot olarak algılanmayı önle
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
];

function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * URL'den domain adını çıkar
 */
function getDomain(url) {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch { return ''; }
}

/**
 * Mağaza adını domain'den güzelleştir
 */
function prettifyStoreName(domain) {
    const storeMap = {
        'trendyol.com': 'Trendyol',
        'hepsiburada.com': 'Hepsiburada',
        'amazon.com.tr': 'Amazon',
        'n11.com': 'N11',
        'mediamarkt.com.tr': 'MediaMarkt',
        'teknosa.com': 'Teknosa',
        'vatanbilgisayar.com': 'Vatan Bilgisayar',
        'a101.com.tr': 'A101',
        'bim.com.tr': 'BİM',
        'sok.com.tr': 'ŞÖK',
        'migros.com.tr': 'Migros',
        'gratis.com': 'Gratis',
        'watsons.com.tr': 'Watsons',
        'koton.com': 'Koton',
        'lcwaikiki.com': 'LC Waikiki',
        'defacto.com.tr': 'DeFacto',
        'boyner.com.tr': 'Boyner',
        'getir.com': 'Getir',
        'ciceksepeti.com': 'Çiçek Sepeti',
        'gittigidiyor.com': 'GittiGidiyor',
        'pttavm.com': 'PTT AVM',
        'morhipo.com': 'Morhipo',
        'apple.com': 'Apple',
        'samsung.com': 'Samsung',
        'xiaomi.com.tr': 'Xiaomi'
    };
    for (const [key, val] of Object.entries(storeMap)) {
        if (domain.includes(key)) return val;
    }
    // Domain'den tahmin et
    const parts = domain.split('.');
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
}

/**
 * Fiyat metnini parse et: "6.999,90 TL" → 6999.90
 */
function parsePrice(priceStr) {
    if (!priceStr) return null;
    // Sadece sayısal karakterleri bırak
    let cleaned = priceStr
        .replace(/[₺TL\s]/gi, '')
        .replace(/\./g, '') // binlik ayracı
        .replace(',', '.') // ondalık
        .trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

/**
 * Ana scrape fonksiyonu
 */
async function scrapeUrl(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': getRandomUA(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br'
            },
            signal: controller.signal,
            redirect: 'follow'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const domain = getDomain(url);
        let result = {
            title: '',
            description: '',
            image_url: '',
            price: null,
            old_price: null,
            store_name: prettifyStoreName(domain),
            source_url: url
        };

        // 1. JSON-LD Schema.org verisi — en güvenilir kaynak
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const json = JSON.parse($(el).html());
                const products = [];

                // Düz obje veya array olabilir
                const items = Array.isArray(json) ? json : [json];
                for (const item of items) {
                    if (item['@type'] === 'Product') products.push(item);
                    if (item['@graph']) {
                        for (const g of item['@graph']) {
                            if (g['@type'] === 'Product') products.push(g);
                        }
                    }
                }

                for (const product of products) {
                    if (product.name && !result.title) result.title = product.name;
                    if (product.description && !result.description) {
                        result.description = product.description.substring(0, 300);
                    }
                    if (product.image) {
                        const img = Array.isArray(product.image) ? product.image[0] : product.image;
                        if (typeof img === 'string' && !result.image_url) result.image_url = img;
                        if (typeof img === 'object' && img.url && !result.image_url) result.image_url = img.url;
                    }
                    // Fiyat
                    const offers = product.offers;
                    if (offers) {
                        const offer = Array.isArray(offers) ? offers[0] : offers;
                        if (offer.price && !result.price) result.price = parseFloat(offer.price);
                        if (offer.highPrice && !result.old_price) result.old_price = parseFloat(offer.highPrice);
                    }
                }
            } catch { /* JSON parse hatası — devam et */ }
        });

        // 2. Open Graph meta tag'ler
        if (!result.title) result.title = $('meta[property="og:title"]').attr('content') || '';
        if (!result.description) result.description = ($('meta[property="og:description"]').attr('content') || '').substring(0, 300);
        if (!result.image_url) result.image_url = $('meta[property="og:image"]').attr('content') || '';

        // OG price
        if (!result.price) {
            const ogPrice = $('meta[property="og:price:amount"], meta[property="product:price:amount"]').attr('content');
            if (ogPrice) result.price = parseFloat(ogPrice);
        }

        // 3. Standart meta tag'ler (fallback)
        if (!result.title) result.title = $('title').text().trim();
        if (!result.description) result.description = ($('meta[name="description"]').attr('content') || '').substring(0, 300);

        // 4. Site-özel parser'lar
        if (domain.includes('trendyol.com')) {
            result = parseTrendyol($, result);
        } else if (domain.includes('hepsiburada.com')) {
            result = parseHepsiburada($, result);
        } else if (domain.includes('amazon.com.tr')) {
            result = parseAmazon($, result);
        } else if (domain.includes('n11.com')) {
            result = parseN11($, result);
        }

        // 5. Genel fiyat arama (fallback)
        if (!result.price) {
            result.price = findPriceInPage($);
        }

        // 6. Genel görsel arama (fallback)
        if (!result.image_url) {
            result.image_url = findMainImage($, url);
        }

        // Göreceli URL'leri mutlak yap
        if (result.image_url && !result.image_url.startsWith('http')) {
            try {
                result.image_url = new URL(result.image_url, url).href;
            } catch { result.image_url = ''; }
        }

        // Başlığı temizle
        result.title = cleanTitle(result.title, result.store_name);

        return result;

    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error('Sayfa yüklenme zaman aşımı (10s).');
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

// ═══════════════════════════════════════
// SİTE-ÖZEL PARSER'LAR
// ═══════════════════════════════════════

function parseTrendyol($, result) {
    // Trendyol'un JS-rendered sayfası olabilir, HTML'den ne varsa al
    if (!result.price) {
        const priceText = $('.prc-dsc, .prc-slg, span[class*="Price"]').first().text();
        result.price = parsePrice(priceText);
    }
    if (!result.old_price) {
        const oldText = $('.prc-org, span[class*="OldPrice"]').first().text();
        result.old_price = parsePrice(oldText);
    }
    if (!result.title) {
        result.title = $('h1.pr-new-br, h1[class*="Title"]').text().trim();
    }
    return result;
}

function parseHepsiburada($, result) {
    if (!result.price) {
        const priceText = $('[data-test-id="price-current-price"], .price-value, span[id*="offering-price"]').first().text();
        result.price = parsePrice(priceText);
    }
    if (!result.old_price) {
        const oldText = $('[data-test-id="price-old-price"], .price-old, span[id*="market-price"]').first().text();
        result.old_price = parsePrice(oldText);
    }
    if (!result.title) {
        result.title = $('h1[data-test-id="product-name"], h1.product-name').text().trim();
    }
    return result;
}

function parseAmazon($, result) {
    if (!result.price) {
        const priceWhole = $('#priceblock_ourprice, #priceblock_dealprice, .a-price .a-offscreen, span.a-price-whole').first().text();
        result.price = parsePrice(priceWhole);
    }
    if (!result.old_price) {
        const oldText = $('.a-text-price .a-offscreen, .priceBlockStrikePriceString').first().text();
        result.old_price = parsePrice(oldText);
    }
    if (!result.title) {
        result.title = $('#productTitle').text().trim();
    }
    if (!result.image_url) {
        result.image_url = $('#landingImage, #imgBlkFront').attr('data-old-hires') ||
            $('#landingImage, #imgBlkFront').attr('src') || '';
    }
    return result;
}

function parseN11($, result) {
    if (!result.price) {
        const priceText = $('.newPrice ins, .newPrice .price-value').first().text();
        result.price = parsePrice(priceText);
    }
    if (!result.old_price) {
        const oldText = $('.oldPrice del, .oldPrice .price-value').first().text();
        result.old_price = parsePrice(oldText);
    }
    if (!result.title) {
        result.title = $('h1.proName, h1.product-title').text().trim();
    }
    return result;
}

// ═══════════════════════════════════════
// YARDIMCI FONKSİYONLAR
// ═══════════════════════════════════════

function findPriceInPage($) {
    // Yaygın fiyat selektörleri
    const selectors = [
        '[class*="price"]:not([class*="old"]):not([class*="Original"])',
        '[id*="price"]:not([id*="old"])',
        '[data-price]',
        '.sale-price', '.current-price', '.actual-price'
    ];

    for (const sel of selectors) {
        const el = $(sel).first();
        if (el.length) {
            const text = el.attr('content') || el.attr('data-price') || el.text();
            const price = parsePrice(text);
            if (price && price > 0 && price < 1000000) return price;
        }
    }
    return null;
}

function findMainImage($, baseUrl) {
    // Büyük ürün görseli bul
    const candidates = $('img[src]').toArray()
        .map(el => ({
            src: $(el).attr('src') || '',
            width: parseInt($(el).attr('width') || '0'),
            alt: $(el).attr('alt') || ''
        }))
        .filter(img => {
            const src = img.src.toLowerCase();
            return !src.includes('logo') && !src.includes('icon') &&
                !src.includes('sprite') && !src.includes('tracking') &&
                !src.includes('pixel') && !src.includes('blank') &&
                (src.endsWith('.jpg') || src.endsWith('.jpeg') ||
                    src.endsWith('.png') || src.endsWith('.webp') ||
                    src.includes('/im/') || src.includes('/product/'));
        })
        .sort((a, b) => b.width - a.width);

    return candidates.length > 0 ? candidates[0].src : '';
}

function cleanTitle(title, storeName) {
    if (!title) return '';
    // Store adını başlıktan çıkar
    return title
        .replace(new RegExp(`[\\-–|]\\s*${storeName}.*$`, 'i'), '')
        .replace(/\s*[-–|]\s*$/, '')
        .trim()
        .substring(0, 200);
}

module.exports = { scrapeUrl, parsePrice, prettifyStoreName };
