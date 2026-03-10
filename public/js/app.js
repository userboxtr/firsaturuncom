/**
 * FIRSAT ÜRÜN - Ana Uygulama
 */

// Yardımcı fonksiyonlar
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatPrice(price) {
    if (!price && price !== 0) return '';
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(price);
}

// Mockup format: "6.999 TL"
function formatPriceTL(price) {
    if (!price && price !== 0) return '';
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price) + ' TL';
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + (dateStr.includes('Z') ? '' : 'Z'));
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'Az önce';
    if (diff < 3600) return `${Math.floor(diff / 60)} dk`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} sa`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} gün`;
    if (diff < 2592000) return `${Math.floor(diff / 604800)} hafta`;
    return date.toLocaleDateString('tr-TR');
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        Toast.show('📋 Panoya kopyalandı!', 'success');
    }).catch(() => {
        Toast.show('Kopyalama başarısız.', 'error');
    });
}

// Ana Uygulama
const App = {
    categories: [],
    filters: {},
    isLoadingMore: false,

    async init() {
        console.log('🛒 FIRSAT ÜRÜN başlatılıyor...');

        // Dark mode restore
        if (localStorage.getItem('fu_theme') === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.getElementById('darkModeToggle').textContent = '☀️';
        }

        // Tema rengi yükle
        try {
            const res = await fetch('/api/theme');
            const { theme } = await res.json();
            if (theme && theme !== 'mint') {
                document.documentElement.setAttribute('data-color-theme', theme);
            }
        } catch (e) { /* varsayılan tema */ }

        Modal.init();
        Auth.init();

        await this.loadCategories();
        await this.loadStats();
        await this.loadLeaderboard();
        await this.loadDeals();

        this.bindEvents();
        this.initHeaderScroll();
        this.initMobileSearch();
        this.initDarkMode();
        this.initFilters();
        this.initInfiniteScroll();

        console.log('✅ FIRSAT ÜRÜN hazır!');
    },

    async loadCategories() {
        try {
            const categories = await API.getCategories();
            this.categories = categories;
            const strip = document.getElementById('categoryStrip');

            const pillsHtml = categories.map(c => `
                <div class="category-pill" data-category="${c.slug}">
                    ${c.icon} ${escapeHtml(c.name)}
                </div>
            `).join('');

            strip.innerHTML = `<div class="category-pill active" data-category="">Tüm Fırsatlar</div>${pillsHtml}`;

            // Kategori tıklama
            strip.querySelectorAll('.category-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    strip.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    Deals.currentCategory = pill.dataset.category;
                    Deals.currentPage = 1;
                    this.loadDeals();
                });
            });

            // Fırsat paylaş formundaki kategori select doldur
            const select = document.getElementById('dealCategory');
            if (select) {
                select.innerHTML = '<option value="">Seçiniz</option>' +
                    categories.map(c => `<option value="${c.id}">${c.icon} ${escapeHtml(c.name)}</option>`).join('');
            }
        } catch (err) {
            console.error('Kategori yükleme hatası:', err);
        }
    },

    async loadDeals(append = false) {
        const params = {
            sort: Deals.currentSort,
            page: Deals.currentPage,
            limit: 15
        };
        if (Deals.currentCategory) params.category = Deals.currentCategory;
        if (Deals.currentSearch) params.search = Deals.currentSearch;

        // Filtreler
        if (this.filters.min_price) params.min_price = this.filters.min_price;
        if (this.filters.max_price) params.max_price = this.filters.max_price;
        if (this.filters.store) params.store = this.filters.store;
        if (this.filters.deal_type) params.deal_type = this.filters.deal_type;
        if (this.filters.has_coupon) params.has_coupon = 'true';

        try {
            const data = await API.getDeals(params);

            if (append && data.deals.length > 0) {
                // Infinite scroll — mevcut kartlara ekle
                const feed = document.getElementById('dealsFeed');
                const loader = feed.querySelector('.infinite-loader');
                if (loader) loader.remove();
                feed.insertAdjacentHTML('beforeend', data.deals.map(d => Deals.renderDealCard(d)).join(''));
                this._totalPages = data.pagination.totalPages;
            } else {
                Deals.renderDeals(data.deals);
                this._totalPages = data.pagination.totalPages;
            }

            // Pagination kaldır (infinite scroll var)
            const existing = document.querySelector('.pagination');
            if (existing) existing.remove();

            Deals.bindSubmitButtons();
            this.isLoadingMore = false;
        } catch (err) {
            console.error('Fırsat yükleme hatası:', err);
            this.isLoadingMore = false;
            if (!append) {
                document.getElementById('dealsFeed').innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">⚠️</div>
                        <div class="empty-state-title">Yükleme hatası</div>
                        <p class="text-muted">Lütfen sayfayı yenileyin.</p>
                    </div>`;
            }
        }
    },

    async loadStats() {
        try {
            const stats = await API.getStats();
            document.getElementById('statUsers').textContent = stats.total_users || 0;
            document.getElementById('statDeals').textContent = stats.total_deals || 0;
            document.getElementById('statToday').textContent = stats.today_deals || 0;
            document.getElementById('statComments').textContent = stats.total_comments || 0;
        } catch (err) {
            console.error('İstatistik hatası:', err);
        }
    },

    async loadLeaderboard() {
        try {
            const users = await API.getLeaderboard();
            const list = document.getElementById('leaderboardList');

            if (!users || users.length === 0) {
                list.innerHTML = '<p class="text-sm text-muted">Henüz kullanıcı yok</p>';
                return;
            }

            list.innerHTML = users.slice(0, 5).map((u, i) => {
                const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
                return `
                <div class="leaderboard-item">
                    <div class="leaderboard-rank ${rankClass}">${i + 1}</div>
                    <span class="leaderboard-name">${u.levelInfo ? u.levelInfo.badge : '🌱'} ${escapeHtml(u.username)}</span>
                    <span class="leaderboard-points">${u.points} p</span>
                </div>`;
            }).join('');
        } catch (err) {
            console.error('Liderlik tablosu hatası:', err);
        }
    },

    bindEvents() {
        // Sıralama
        document.querySelectorAll('.sort-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                Deals.currentSort = tab.dataset.sort;
                Deals.currentPage = 1;
                this.loadDeals();
            });
        });

        // FAB ve sidebar fırsat paylaş butonları
        Deals.bindSubmitButtons();
        document.getElementById('fabBtn')?.addEventListener('click', () => {
            if (!Auth.isLoggedIn()) {
                Modal.open('authModal');
                return;
            }
            Modal.open('submitModal');
        });

        // === GÖRSEL SÜRÜKLE-BIRAK & YÜKLEME ===
        const dropZone = document.getElementById('imageDropZone');
        const fileInput = document.getElementById('dealImageFile');
        const preview = document.getElementById('imagePreview');
        const previewArea = document.getElementById('imagePreviewArea');
        const dropContent = document.getElementById('imageDropContent');
        const removeBtn = document.getElementById('removeImageBtn');
        const fileNameEl = document.getElementById('imageFileName');
        App._selectedFile = null;

        // Tıklayınca dosya seçici aç
        dropZone?.addEventListener('click', (e) => {
            if (e.target === removeBtn || e.target.closest('#removeImageBtn')) return;
            fileInput.click();
        });

        // Dosya seçilince
        fileInput?.addEventListener('change', (e) => {
            if (e.target.files[0]) App.handleImageFile(e.target.files[0]);
        });

        // Sürükle-bırak
        dropZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--mint)';
            dropZone.style.background = 'var(--mint-light)';
        });
        dropZone?.addEventListener('dragleave', () => {
            dropZone.style.borderColor = 'var(--text-light)';
            dropZone.style.background = '#F5F7FA';
        });
        dropZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--text-light)';
            dropZone.style.background = '#F5F7FA';
            if (e.dataTransfer.files[0]) App.handleImageFile(e.dataTransfer.files[0]);
        });

        // Görseli kaldır
        removeBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            App._selectedFile = null;
            document.getElementById('uploadedImageUrl').value = '';
            preview.src = '';
            previewArea.style.display = 'none';
            dropContent.style.display = '';
            fileInput.value = '';
        });

        // URL'den önizleme
        document.getElementById('dealImage')?.addEventListener('input', (e) => {
            const url = e.target.value.trim();
            if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                preview.src = url;
                preview.onerror = () => { previewArea.style.display = 'none'; dropContent.style.display = ''; };
                preview.onload = () => {
                    previewArea.style.display = '';
                    dropContent.style.display = 'none';
                    fileNameEl.textContent = 'URL\'den yüklenen görsel';
                    App._selectedFile = null;
                    document.getElementById('uploadedImageUrl').value = url;
                };
            }
        });

        // ═══════════════════════════════════════
        // 🔗 LINK CRAWL — URL yapıştır → Otomatik doldur
        // ═══════════════════════════════════════
        const dealLinkInput = document.getElementById('dealLink');
        let scrapeTimer = null;

        const autoFillFromUrl = async (url) => {
            if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return;
            if (!Auth.isLoggedIn()) return;

            // Loading göster
            dealLinkInput.style.borderColor = '#56C6C0';
            dealLinkInput.style.boxShadow = '0 0 0 3px rgba(86,198,192,0.2)';

            // Drop zone'u loading göster
            const dropContent = document.getElementById('imageDropContent');
            const originalDropHtml = dropContent.innerHTML;
            dropContent.innerHTML = `
                <div style="font-size: 2rem; animation: pulse 1s infinite;">🔗</div>
                <p style="font-weight: 600; color: var(--text-dark);">Link bilgileri alınıyor...</p>
                <p style="font-size: 0.72rem; color: var(--text-light);">Ürün bilgileri otomatik doldurulacak</p>
            `;

            try {
                const data = await API.scrapeUrl(url);

                // Başlık
                const titleInput = document.getElementById('dealTitle');
                if (data.title && !titleInput.value) {
                    titleInput.value = data.title;
                    titleInput.style.borderColor = '#00B894';
                    setTimeout(() => titleInput.style.borderColor = '', 2000);
                }

                // Fiyat
                if (data.price) {
                    const priceInput = document.getElementById('dealPrice');
                    if (!priceInput.value) {
                        priceInput.value = data.price;
                        priceInput.style.borderColor = '#00B894';
                        setTimeout(() => priceInput.style.borderColor = '', 2000);
                    }
                }

                // Eski fiyat
                if (data.old_price) {
                    const oldPriceInput = document.getElementById('dealOldPrice');
                    if (!oldPriceInput.value) {
                        oldPriceInput.value = data.old_price;
                        oldPriceInput.style.borderColor = '#00B894';
                        setTimeout(() => oldPriceInput.style.borderColor = '', 2000);
                    }
                }

                // Mağaza adı
                if (data.store_name) {
                    const storeInput = document.getElementById('dealStore');
                    if (!storeInput.value) {
                        storeInput.value = data.store_name;
                        storeInput.style.borderColor = '#00B894';
                        setTimeout(() => storeInput.style.borderColor = '', 2000);
                    }
                }

                // Görsel
                if (data.image_url) {
                    const imgInput = document.getElementById('dealImage');
                    if (!imgInput.value && !document.getElementById('uploadedImageUrl').value) {
                        imgInput.value = data.image_url;
                        document.getElementById('uploadedImageUrl').value = data.image_url;
                        preview.src = data.image_url;
                        preview.onload = () => {
                            previewArea.style.display = '';
                            dropContent.style.display = 'none';
                            fileNameEl.textContent = '🔗 Linkten alınan görsel';
                        };
                        preview.onerror = () => {
                            dropContent.innerHTML = originalDropHtml;
                            dropContent.style.display = '';
                        };
                    } else {
                        dropContent.innerHTML = originalDropHtml;
                    }
                } else {
                    dropContent.innerHTML = originalDropHtml;
                }

                // İndirim hesapla
                calcDiscount();

                // Doldurulan alan sayısı
                let filledCount = 0;
                if (data.title) filledCount++;
                if (data.price) filledCount++;
                if (data.old_price) filledCount++;
                if (data.store_name) filledCount++;
                if (data.image_url) filledCount++;

                if (filledCount > 0) {
                    Toast.show(`✨ ${filledCount} alan otomatik dolduruldu!`, 'success');
                } else {
                    Toast.show('ℹ️ Bu linkten bilgi alınamadı, manuel doldurun.', 'info', 3000);
                }

            } catch (err) {
                console.error('Link scrape hatası:', err);
                dropContent.innerHTML = originalDropHtml;
                // Hata mesajı gösterme — sessizce geç, kullanıcı manuel dolduracak
            } finally {
                dealLinkInput.style.borderColor = '';
                dealLinkInput.style.boxShadow = '';
            }
        };

        // Paste event — anlık tepki
        dealLinkInput?.addEventListener('paste', (e) => {
            setTimeout(() => {
                autoFillFromUrl(dealLinkInput.value.trim());
            }, 100);
        });

        // Input change — debounce ile (kullanıcı elle yazarsa)
        dealLinkInput?.addEventListener('input', () => {
            clearTimeout(scrapeTimer);
            const val = dealLinkInput.value.trim();
            if (val.startsWith('http')) {
                scrapeTimer = setTimeout(() => autoFillFromUrl(val), 1500);
            }
        });

        // İndirim hesaplayıcı
        const calcDiscount = () => {
            const price = parseFloat(document.getElementById('dealPrice')?.value);
            const oldPrice = parseFloat(document.getElementById('dealOldPrice')?.value);
            const previewEl = document.getElementById('discountPreview');
            if (price && oldPrice && oldPrice > price) {
                const pct = Math.round((1 - price / oldPrice) * 100);
                previewEl.textContent = `🎯 %${pct} İndirim! (${formatPriceTL(oldPrice - price)} tasarruf)`;
                previewEl.style.display = '';
            } else {
                previewEl.style.display = 'none';
            }
        };
        document.getElementById('dealPrice')?.addEventListener('input', calcDiscount);
        document.getElementById('dealOldPrice')?.addEventListener('input', calcDiscount);

        // Fırsat paylaş form
        document.getElementById('submitDealForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!Auth.isLoggedIn()) {
                Modal.open('authModal');
                return;
            }

            const submitBtn = document.getElementById('submitDealBtn');
            const origText = submitBtn.innerHTML;
            submitBtn.innerHTML = '⏳ Paylaşılıyor...';
            submitBtn.disabled = true;

            try {
                // Önce görseli yükle (dosya varsa)
                let imageUrl = document.getElementById('uploadedImageUrl').value
                    || document.getElementById('dealImage').value || null;

                if (App._selectedFile) {
                    Toast.show('📸 Görsel yükleniyor...', 'success', 2000);
                    const uploadResult = await API.uploadImage(App._selectedFile);
                    imageUrl = uploadResult.url;
                }

                const deal = {
                    title: document.getElementById('dealTitle').value,
                    link: document.getElementById('dealLink').value || null,
                    price: parseFloat(document.getElementById('dealPrice').value) || null,
                    old_price: parseFloat(document.getElementById('dealOldPrice').value) || null,
                    store_name: document.getElementById('dealStore').value,
                    category_id: document.getElementById('dealCategory').value || null,
                    deal_type: document.getElementById('dealType').value,
                    coupon_code: document.getElementById('dealCoupon').value || null,
                    description: document.getElementById('dealDescription').value,
                    expires_at: document.getElementById('dealExpiry').value || null,
                    image_url: imageUrl
                };

                await API.createDeal(deal);
                Modal.close('submitModal');
                document.getElementById('submitDealForm').reset();

                // Preview temizle
                App._selectedFile = null;
                document.getElementById('uploadedImageUrl').value = '';
                preview.src = '';
                previewArea.style.display = 'none';
                dropContent.style.display = '';
                document.getElementById('discountPreview').style.display = 'none';

                Toast.show('Fırsat paylaşıldı! 🎉 +5 puan kazandın!', 'success');
                Deals.currentPage = 1;
                Deals.currentSort = 'new';
                document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
                document.querySelector('[data-sort="new"]')?.classList.add('active');
                this.loadDeals();
                this.loadStats();
            } catch (err) {
                Toast.show(err.message, 'error');
            } finally {
                submitBtn.innerHTML = origText;
                submitBtn.disabled = false;
            }
        });

        // Arama
        let searchTimer;
        const searchHandler = (input) => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                Deals.currentSearch = input.value.trim();
                Deals.currentPage = 1;
                this.loadDeals();
            }, 500);
        };

        document.getElementById('searchInput')?.addEventListener('input', (e) => searchHandler(e.target));
        document.getElementById('mobileSearchInput')?.addEventListener('input', (e) => searchHandler(e.target));

        // Logo tıklama - ana sayfaya dön
        document.getElementById('logoLink')?.addEventListener('click', (e) => {
            e.preventDefault();
            Deals.currentCategory = '';
            Deals.currentSearch = '';
            Deals.currentSort = 'hot';
            Deals.currentPage = 1;
            document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
            document.querySelector('[data-category=""]')?.classList.add('active');
            document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
            document.querySelector('[data-sort="hot"]')?.classList.add('active');
            document.getElementById('searchInput').value = '';
            this.loadDeals();
        });
    },

    initHeaderScroll() {
        const header = document.getElementById('mainHeader');
        let lastScroll = 0;

        window.addEventListener('scroll', () => {
            const currentScroll = window.scrollY;
            if (currentScroll > 10) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
            lastScroll = currentScroll;
        });
    },

    initMobileSearch() {
        const btn = document.getElementById('mobileSearchBtn');
        const searchArea = document.getElementById('mobileSearch');

        // Mobil arama butonu göster/gizle
        const checkMobile = () => {
            if (window.innerWidth <= 480) {
                btn.style.display = 'flex';
            } else {
                btn.style.display = 'none';
                searchArea.style.display = 'none';
            }
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);

        btn?.addEventListener('click', () => {
            const isVisible = searchArea.style.display === 'flex';
            searchArea.style.display = isVisible ? 'none' : 'flex';
            if (!isVisible) {
                document.getElementById('mobileSearchInput')?.focus();
            }
        });
    },

    handleImageFile(file) {
        // Boyut kontrolü
        if (file.size > 5 * 1024 * 1024) {
            Toast.show('Dosya en fazla 5MB olabilir.', 'error');
            return;
        }

        // Format kontrolü
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
        if (!allowed.includes(file.type)) {
            Toast.show('Desteklenmeyen format. JPG, PNG, WEBP kullanın.', 'error');
            return;
        }

        // FileReader ile önizleme
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('imagePreview');
            const previewArea = document.getElementById('imagePreviewArea');
            const dropContent = document.getElementById('imageDropContent');
            const fileNameEl = document.getElementById('imageFileName');

            preview.src = e.target.result;
            previewArea.style.display = '';
            dropContent.style.display = 'none';

            const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
            fileNameEl.textContent = `📁 ${file.name} (${sizeMB} MB)`;
        };
        reader.readAsDataURL(file);

        // Dosyayı sakla (submit edilince yüklenecek)
        // selectedFile App.bindEvents scope'unda tanımlı — closure ile erişiyoruz
        // Bunun yerine App objesine bağlayalım
        this._selectedFile = file;

        // bindEvents scope'undaki selectedFile'ı da güncelle
        // Bu trick: app.js'deki selectedFile erişimi
        const fileInput = document.getElementById('dealImageFile');
        // DataTransfer ile input'a dosyayı set edelim
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
    },

    // ═══════════════════════════════════════
    // 🌙 DARK MODE
    // ═══════════════════════════════════════
    initDarkMode() {
        const toggle = document.getElementById('darkModeToggle');
        toggle?.addEventListener('click', () => {
            const html = document.documentElement;
            const isDark = html.getAttribute('data-theme') === 'dark';
            if (isDark) {
                html.removeAttribute('data-theme');
                toggle.textContent = '🌙';
                localStorage.setItem('fu_theme', 'light');
            } else {
                html.setAttribute('data-theme', 'dark');
                toggle.textContent = '☀️';
                localStorage.setItem('fu_theme', 'dark');
            }
        });
    },

    // ═══════════════════════════════════════
    // 🔍 GELİŞMİŞ FİLTRELEME
    // ═══════════════════════════════════════
    initFilters() {
        const toggleBtn = document.getElementById('filterToggleBtn');
        const panel = document.getElementById('filterPanel');
        const applyBtn = document.getElementById('applyFiltersBtn');
        const clearBtn = document.getElementById('clearFiltersBtn');

        toggleBtn?.addEventListener('click', () => {
            panel.classList.toggle('active');
            toggleBtn.classList.toggle('active');
        });

        applyBtn?.addEventListener('click', () => {
            this.filters = {};
            const minPrice = document.getElementById('filterMinPrice')?.value;
            const maxPrice = document.getElementById('filterMaxPrice')?.value;
            const store = document.getElementById('filterStore')?.value?.trim();
            const dealType = document.getElementById('filterType')?.value;
            const hasCoupon = document.getElementById('filterCoupon')?.checked;

            if (minPrice) this.filters.min_price = minPrice;
            if (maxPrice) this.filters.max_price = maxPrice;
            if (store) this.filters.store = store;
            if (dealType) this.filters.deal_type = dealType;
            if (hasCoupon) this.filters.has_coupon = true;

            Deals.currentPage = 1;
            this.loadDeals();
            Toast.show('🔍 Filtreler uygulandı', 'success', 1500);
        });

        clearBtn?.addEventListener('click', () => {
            this.filters = {};
            document.getElementById('filterMinPrice').value = '';
            document.getElementById('filterMaxPrice').value = '';
            document.getElementById('filterStore').value = '';
            document.getElementById('filterType').value = '';
            document.getElementById('filterCoupon').checked = false;

            Deals.currentPage = 1;
            this.loadDeals();
            panel.classList.remove('active');
            toggleBtn.classList.remove('active');
            Toast.show('Filtreler temizlendi', 'success', 1500);
        });
    },

    // ═══════════════════════════════════════
    // ♾️ INFINITE SCROLL
    // ═══════════════════════════════════════
    initInfiniteScroll() {
        window.addEventListener('scroll', () => {
            if (this.isLoadingMore) return;

            const scrollBottom = window.innerHeight + window.scrollY;
            const docHeight = document.documentElement.scrollHeight;

            // Sayfanın %80'ine gelince yeni sayfa yükle
            if (scrollBottom >= docHeight - 400) {
                if (Deals.currentPage < (this._totalPages || 1)) {
                    this.isLoadingMore = true;
                    Deals.currentPage++;

                    // Loading spinner göster
                    const feed = document.getElementById('dealsFeed');
                    if (!feed.querySelector('.infinite-loader')) {
                        feed.insertAdjacentHTML('beforeend', `
                            <div class="infinite-loader">
                                <div class="spinner"></div>
                                <p>Daha fazla fırsat yükleniyor...</p>
                            </div>
                        `);
                    }

                    this.loadDeals(true);
                }
            }
        });
    },

    // ═══════════════════════════════════════
    // 💰 YATIRIMCI FORMU
    // ═══════════════════════════════════════
    async submitInvestorForm() {
        const name = document.getElementById('investorName')?.value?.trim();
        const email = document.getElementById('investorEmail')?.value?.trim();
        const phone = document.getElementById('investorPhone')?.value?.trim();
        const company = document.getElementById('investorCompany')?.value?.trim();
        const message = document.getElementById('investorMessage')?.value?.trim();

        if (!name || !email || !message) {
            Toast.show('İsim, e-posta ve mesaj zorunludur.', 'error');
            return;
        }

        const btn = document.getElementById('investorSubmitBtn');
        btn.disabled = true;
        btn.textContent = '⏳ Gönderiliyor...';

        try {
            const res = await fetch('/api/investor-apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, phone, company, message })
            });
            const data = await res.json();

            if (res.ok) {
                Toast.show('✅ ' + data.message, 'success');
                Modal.close('investorModal');
                // Formu temizle
                ['investorName', 'investorEmail', 'investorPhone', 'investorCompany', 'investorMessage']
                    .forEach(id => { document.getElementById(id).value = ''; });
            } else {
                Toast.show(data.error || 'Bir hata oluştu.', 'error');
            }
        } catch (err) {
            Toast.show('Bağlantı hatası. Lütfen tekrar deneyin.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '🚀 Başvuruyu Gönder';
        }
    }
};

// Sayfa yüklenince başlat
document.addEventListener('DOMContentLoaded', () => App.init());
