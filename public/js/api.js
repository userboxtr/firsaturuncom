/**
 * FIRSAT ÜRÜN - API İstemci Modülü
 */
const API = {
    BASE: '/api',

    getToken() {
        return localStorage.getItem('fu_token');
    },

    setToken(token) {
        localStorage.setItem('fu_token', token);
    },

    removeToken() {
        localStorage.removeItem('fu_token');
        localStorage.removeItem('fu_user');
    },

    getUser() {
        const u = localStorage.getItem('fu_user');
        return u ? JSON.parse(u) : null;
    },

    setUser(user) {
        localStorage.setItem('fu_user', JSON.stringify(user));
    },

    headers(withAuth = true) {
        const h = { 'Content-Type': 'application/json' };
        if (withAuth && this.getToken()) {
            h['Authorization'] = `Bearer ${this.getToken()}`;
        }
        return h;
    },

    async request(method, url, body = null, auth = true) {
        const opts = {
            method,
            headers: this.headers(auth)
        };
        if (body) opts.body = JSON.stringify(body);

        const res = await fetch(this.BASE + url, opts);
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Bir hata oluştu.');
        }
        return data;
    },

    // Auth
    async register(username, email, password) {
        const data = await this.request('POST', '/auth/register', { username, email, password }, false);
        if (data.token) {
            this.setToken(data.token);
            this.setUser(data.user);
        }
        return data;
    },

    async login(email, password) {
        const data = await this.request('POST', '/auth/login', { email, password }, false);
        this.setToken(data.token);
        this.setUser(data.user);
        return data;
    },

    async getMe() {
        return this.request('GET', '/auth/me');
    },

    logout() {
        this.removeToken();
        window.location.reload();
    },

    // Deals
    async getDeals(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return this.request('GET', `/deals?${qs}`, null, !!this.getToken());
    },

    async getDeal(id) {
        return this.request('GET', `/deals/${id}`, null, !!this.getToken());
    },

    async createDeal(deal) {
        return this.request('POST', '/deals', deal);
    },

    async voteDeal(id, voteType) {
        return this.request('POST', `/deals/${id}/vote`, { vote_type: voteType });
    },

    async deleteDeal(id) {
        return this.request('DELETE', `/deals/${id}`);
    },

    // Comments
    async getComments(dealId) {
        return this.request('GET', `/comments/deal/${dealId}`, null, false);
    },

    async createComment(dealId, content, parentId = null) {
        return this.request('POST', '/comments', {
            deal_id: dealId,
            content,
            parent_id: parentId
        });
    },

    async deleteComment(id) {
        return this.request('DELETE', `/comments/${id}`);
    },

    // Users
    async getProfile(username) {
        return this.request('GET', `/users/${username}`, null, false);
    },

    async getLeaderboard() {
        return this.request('GET', '/users/leaderboard/top', null, false);
    },

    async getNotifications() {
        return this.request('GET', '/users/me/notifications');
    },

    async markNotificationsRead() {
        return this.request('PUT', '/users/me/notifications/read');
    },

    // Categories
    async getCategories() {
        return this.request('GET', '/categories', null, false);
    },

    // Stats
    async getStats() {
        return this.request('GET', '/stats', null, false);
    },

    // AI
    async verifyDeal(dealId) {
        return this.request('POST', '/ai/verify', { deal_id: dealId });
    },

    async getAiResult(dealId) {
        return this.request('GET', `/ai/result/${dealId}`, null, false);
    },

    // Görsel yükleme (multipart)
    async uploadImage(file) {
        const formData = new FormData();
        formData.append('image', file);
        const res = await fetch(this.BASE + '/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.getToken()}` },
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Yükleme başarısız.');
        return data;
    },

    // Link Scrape — URL'den ürün bilgisi çek
    async scrapeUrl(url) {
        return this.request('GET', `/scrape?url=${encodeURIComponent(url)}`);
    },

    // Favori toggle
    async favoriteDeal(id) {
        return this.request('POST', `/deals/${id}/favorite`);
    },

    // Fırsat düzenle
    async updateDeal(id, deal) {
        return this.request('PUT', `/deals/${id}`, deal);
    },

    // Şifre değiştir
    async changePassword(currentPassword, newPassword) {
        return this.request('PUT', '/auth/password', {
            current_password: currentPassword,
            new_password: newPassword
        });
    },

    // Yorum düzenle
    async editComment(id, content) {
        return this.request('PUT', `/comments/${id}`, { content });
    },

    // Rapor gönder
    async reportContent(targetType, targetId, reason) {
        return this.request('POST', '/reports', { target_type: targetType, target_id: targetId, reason });
    },

    // Kullanıcı rozetleri
    async getUserBadges(userId) {
        return this.request('GET', `/badges/${userId}`, null, false);
    },

    // Kullanıcı takip
    async followUser(userId) {
        return this.request('POST', `/users/${userId}/follow`);
    },

    // Takip istatistikleri
    async getFollowStats(userId) {
        return this.request('GET', `/users/${userId}/follow-stats`, null, false);
    },

    // Admin analitik
    async getAnalytics() {
        return this.request('GET', '/admin/analytics');
    }
};
