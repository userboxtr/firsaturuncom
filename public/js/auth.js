/**
 * FIRSAT ÜRÜN - Auth Modülü
 */
const Auth = {
    init() {
        this.updateUI();
        this.bindEvents();
    },

    isLoggedIn() {
        return !!API.getToken();
    },

    updateUI() {
        const user = API.getUser();
        const authButtons = document.getElementById('authButtons');
        const userDropdown = document.getElementById('userDropdown');

        if (this.isLoggedIn() && user) {
            authButtons.classList.add('hidden');
            userDropdown.classList.remove('hidden');

            const avatarLetter = document.getElementById('userAvatarLetter');
            const menuUsername = document.getElementById('menuUsername');
            const menuLevel = document.getElementById('menuLevel');

            avatarLetter.textContent = user.username ? user.username[0].toUpperCase() : 'U';
            menuUsername.textContent = user.username || 'Kullanıcı';
            menuLevel.textContent = user.level ? `${user.level.badge} ${user.level.label}` : '🌱 Çaylak';

            this.loadNotifications();
        } else {
            authButtons.classList.remove('hidden');
            userDropdown.classList.add('hidden');
        }
    },

    bindEvents() {
        // Login buton
        document.getElementById('loginBtn')?.addEventListener('click', () => {
            Modal.open('authModal');
        });

        // Login form
        document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            try {
                await API.login(email, password);
                Modal.close('authModal');
                this.updateUI();
                Toast.show('Hoş geldiniz! 🎉', 'success');
                App.loadDeals();
            } catch (err) {
                Toast.show(err.message, 'error');
            }
        });

        // Register form
        document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('regUsername').value;
            const email = document.getElementById('regEmail').value;
            const password = document.getElementById('regPassword').value;

            try {
                const result = await API.register(username, email, password);

                if (result.pending) {
                    // Admin onayı bekliyor — token yok, bilgilendir
                    Modal.close('authModal');
                    document.getElementById('registerForm').reset();
                    Toast.show('✅ Kayıt başarılı! Admin onayı bekleniyor.', 'success', 5000);
                } else {
                    // Normal giriş (admin gibi)
                    Modal.close('authModal');
                    this.updateUI();
                    Toast.show('Hoş geldiniz! 🎉', 'success');
                    App.loadDeals();
                }
            } catch (err) {
                Toast.show(err.message, 'error');
            }
        });

        // Form geçişleri
        document.getElementById('switchToRegister')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('registerForm').classList.remove('hidden');
            document.getElementById('authModalTitle').textContent = 'Kayıt Ol';
        });

        document.getElementById('switchToLogin')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('registerForm').classList.add('hidden');
            document.getElementById('loginForm').classList.remove('hidden');
            document.getElementById('authModalTitle').textContent = 'Giriş Yap';
        });

        // Kullanıcı menüsü
        document.getElementById('userAvatarBtn')?.addEventListener('click', () => {
            document.getElementById('userMenu').classList.toggle('active');
        });

        // Profilim
        document.getElementById('menuProfile')?.addEventListener('click', async () => {
            document.getElementById('userMenu').classList.remove('active');
            const user = API.getUser();
            if (!user) return;
            try {
                const profile = await API.getProfile(user.username);
                const level = profile.levelInfo || { badge: '🌱', label: 'Çaylak' };
                const stats = profile.stats || {};

                const content = `
                    <div style="text-align:center;margin-bottom:16px;">
                        <div class="user-avatar" style="width:64px;height:64px;font-size:1.5rem;margin:0 auto 10px;">
                            ${user.username ? user.username[0].toUpperCase() : 'U'}
                        </div>
                        <h3 style="font-size:1.1rem;font-weight:700;">@${escapeHtml(user.username)}</h3>
                        <p style="font-size:0.82rem;color:var(--text-medium);">${level.badge} ${level.label} · ${profile.points || 0} puan</p>
                    </div>
                    <div class="stats-grid" style="margin-bottom:16px;">
                        <div class="stat-item">
                            <div class="stat-value">${stats.deal_count || 0}</div>
                            <div class="stat-label">Fırsat</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${stats.total_upvotes || 0}</div>
                            <div class="stat-label">Toplam Oy</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${stats.comment_count || 0}</div>
                            <div class="stat-label">Yorum</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${profile.points || 0}</div>
                            <div class="stat-label">Puan</div>
                        </div>
                    </div>
                    ${profile.bio ? `<p style="font-size:0.85rem;color:var(--text-medium);text-align:center;">${escapeHtml(profile.bio)}</p>` : ''}
                    <p style="font-size:0.72rem;color:var(--text-light);text-align:center;margin-top:8px;">📅 Kayıt: ${new Date(profile.created_at).toLocaleDateString('tr-TR')}</p>
                `;

                document.getElementById('detailTitle').textContent = '👤 Profilim';
                document.getElementById('dealDetailContent').innerHTML = content;
                Modal.open('dealDetailModal');
            } catch (err) {
                Toast.show('Profil yüklenemedi: ' + err.message, 'error');
            }
        });

        // Fırsatlarım
        document.getElementById('menuMyDeals')?.addEventListener('click', async () => {
            document.getElementById('userMenu').classList.remove('active');
            const user = API.getUser();
            if (!user) return;
            try {
                const profile = await API.getProfile(user.username);
                const deals = profile.recentDeals || [];

                let content = '';
                if (deals.length === 0) {
                    content = '<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-title">Henüz fırsat paylaşmadın</div><p class="text-muted">İlk fırsatını paylaşmak için FAB butonuna tıkla!</p></div>';
                } else {
                    content = deals.map(d => `
                        <div style="display:flex;gap:12px;align-items:center;padding:12px 0;border-bottom:var(--border-light);cursor:pointer;" onclick="Modal.close('dealDetailModal');Deals.openDetail('${d.id}')">
                            <div style="width:50px;height:50px;border-radius:var(--radius-md);background:#F5F7FA;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                ${d.category_icon || '🛒'}
                            </div>
                            <div style="flex:1;min-width:0;">
                                <div style="font-weight:600;font-size:0.88rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(d.title)}</div>
                                <div style="font-size:0.75rem;color:var(--text-light);">👍 ${d.upvotes || 0} · 💬 ${d.comment_count || 0} · ${timeAgo(d.created_at)}</div>
                            </div>
                        </div>
                    `).join('');
                }

                document.getElementById('detailTitle').textContent = '🔥 Fırsatlarım';
                document.getElementById('dealDetailContent').innerHTML = content;
                Modal.open('dealDetailModal');
            } catch (err) {
                Toast.show('Fırsatlar yüklenemedi: ' + err.message, 'error');
            }
        });

        // Çıkış
        document.getElementById('menuLogout')?.addEventListener('click', () => {
            API.logout();
        });

        // Bildirimler
        document.getElementById('notifBtn')?.addEventListener('click', () => {
            document.getElementById('notifPanel').classList.toggle('active');
            if (this.isLoggedIn()) {
                API.markNotificationsRead().catch(() => { });
                document.getElementById('notifBadge').classList.add('hidden');
            }
        });

        // Dışarı tıklayınca kapat
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#userDropdown')) {
                document.getElementById('userMenu')?.classList.remove('active');
            }
            if (!e.target.closest('#notifDropdown')) {
                document.getElementById('notifPanel')?.classList.remove('active');
            }
        });
    },

    async loadNotifications() {
        if (!this.isLoggedIn()) return;
        try {
            const data = await API.getNotifications();
            const badge = document.getElementById('notifBadge');
            const list = document.getElementById('notifList');

            if (data.unread > 0) {
                badge.textContent = data.unread > 9 ? '9+' : data.unread;
                badge.classList.remove('hidden');
            }

            if (data.notifications.length === 0) {
                list.innerHTML = '<div class="empty-state" style="padding:24px;"><p class="text-muted text-sm">Henüz bildirim yok</p></div>';
                return;
            }

            list.innerHTML = data.notifications.slice(0, 20).map(n => `
                <div class="notification-item ${n.is_read ? '' : 'unread'}">
                    <div class="comment-avatar">${n.from_avatar || (n.from_username ? n.from_username[0].toUpperCase() : '🔔')}</div>
                    <div>
                        <div class="notification-text">${escapeHtml(n.message)}</div>
                        <div class="notification-time-text">${timeAgo(n.created_at)}</div>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            // Sessizce hata yut
        }
    }
};
