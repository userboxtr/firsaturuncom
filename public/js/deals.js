/**
 * FIRSAT ÜRÜN - Fırsat Kartları Modülü
 * Mockup tasarımına birebir uyumlu kart yapısı
 */
const Deals = {
    currentPage: 1,
    currentSort: 'hot',
    currentCategory: '',
    currentSearch: '',

    renderDealCard(deal) {
        const upvotes = deal.upvotes || 0;
        const downvotes = deal.downvotes || 0;
        const userVoteUp = deal.user_vote === 1 ? 'active' : '';
        const userVoteDown = deal.user_vote === -1 ? 'active' : '';

        // Görsel
        const imageContent = deal.image_url
            ? `<img src="${escapeHtml(deal.image_url)}" alt="${escapeHtml(deal.title)}" loading="lazy" onerror="this.style.display='none';this.parentElement.querySelector('.no-image').style.display='block'">`
            : '';

        // Mockup: "Başlık | Mağaza" formatı
        const titleText = deal.store_name
            ? `${escapeHtml(deal.title)}`
            : escapeHtml(deal.title);

        // Mockup: "Fiyat: 6.999 TL" sol + "İndirim: %25" sağ
        const priceHtml = deal.price
            ? `<div class="deal-card-price">
                <span class="price-current">Fiyat: ${formatPriceTL(deal.price)}</span>
                ${deal.discount_percent > 0 ? `<span style="font-size:0.82rem;font-weight:600;color:var(--text-medium);">İndirim: %${deal.discount_percent}</span>` : ''}
               </div>` : '';

        // Kullanıcı bilgisi
        const userLevel = deal.userLevel || { badge: '🌱' };

        return `
        <article class="deal-card" data-id="${deal.id}">
            <!-- Ürün Görseli -->
            <div class="deal-card-image" onclick="Deals.openDetail('${deal.id}')">
                ${deal.is_pinned ? '<span class="pin-badge">📌 Sabit</span>' : ''}
                ${imageContent}
                <span class="no-image" style="${deal.image_url ? 'display:none' : ''}">🛒</span>
            </div>

            <!-- Bilgiler -->
            <div class="deal-card-body" onclick="Deals.openDetail('${deal.id}')">
                ${deal.store_name ? `<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px;"><span style="font-size:0.85rem;">${Deals.getStoreLogo(deal.store_name)}</span><span style="font-size:0.72rem;font-weight:600;color:var(--mint);">${escapeHtml(deal.store_name)}</span></div>` : ''}
                <h3 class="deal-card-title">${titleText}</h3>
                ${priceHtml}
            </div>

            <!-- Oylama + AI Badge -->
            <div class="deal-card-footer">
                <div class="deal-card-votes">
                    <button class="vote-btn-inline up ${userVoteUp}" onclick="Deals.vote('${deal.id}', 1, this)">▲</button>
                    <span class="vote-up-count">${upvotes}</span>
                    <span class="vote-separator">/</span>
                    <button class="vote-btn-inline down ${userVoteDown}" onclick="Deals.vote('${deal.id}', -1, this)">▼</button>
                    <span class="vote-down-count">${downvotes}</span>
                </div>
                <span class="ai-badge" onclick="${deal.ai_score ? '' : `Deals.quickAiInfo('${deal.id}')`}">
                    🤖 ${deal.ai_score ? `${deal.ai_score}/10` : 'AI Doğlu'}
                </span>
            </div>

            <!-- Kullanıcı + Zaman -->
            <div class="deal-card-meta">
                <span class="deal-card-user">
                    <span class="deal-card-user-avatar">${userLevel.badge}</span>
                    @${escapeHtml(deal.username || 'anonim')}
                </span>
                <span style="margin-left:auto;">${timeAgo(deal.created_at)}</span>
            </div>

            <!-- Yorumlar / Detaylar - Mockup'taki alt linkler -->
            <div class="deal-card-links">
                <div class="deal-card-link" onclick="Deals.openDetail('${deal.id}')">
                    💬 Yorumlar
                </div>
                <div class="deal-card-link" onclick="Deals.openDetail('${deal.id}')">
                    📋 Detaylar
                </div>
                <div class="deal-card-link deal-fav-btn" onclick="event.stopPropagation(); Deals.toggleFavorite('${deal.id}', this)" title="Favorilere Ekle">
                    🤍
                </div>
            </div>
        </article>`;
    },

    renderDeals(deals) {
        const feed = document.getElementById('dealsFeed');

        if (!deals || deals.length === 0) {
            feed.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <div class="empty-state-title">Henüz fırsat yok</div>
                    <p class="text-muted">İlk fırsatı sen paylaş!</p>
                    <button class="btn btn-primary mt-lg submit-deal-btn">🔥 Fırsat Paylaş</button>
                </div>`;
            this.bindSubmitButtons();
            return;
        }

        feed.innerHTML = deals.map(d => this.renderDealCard(d)).join('');
    },

    renderPagination(pagination) {
        const existing = document.querySelector('.pagination');
        if (existing) existing.remove();
        if (!pagination || pagination.totalPages <= 1) return;

        const feed = document.getElementById('dealsFeed');
        let html = '<div class="pagination">';
        for (let i = 1; i <= pagination.totalPages; i++) {
            html += `<button class="page-btn ${i === pagination.page ? 'active' : ''}" onclick="Deals.goToPage(${i})">${i}</button>`;
        }
        html += '</div>';
        feed.insertAdjacentHTML('afterend', html);
    },

    async vote(dealId, voteType, btn) {
        if (!Auth.isLoggedIn()) { Modal.open('authModal'); return; }
        try {
            const result = await API.voteDeal(dealId, voteType);
            const card = btn.closest('.deal-card');
            card.querySelector('.vote-up-count').textContent = result.upvotes;
            card.querySelector('.vote-down-count').textContent = result.downvotes;
            card.querySelector('.vote-btn-inline.up').classList.toggle('active', result.user_vote === 1);
            card.querySelector('.vote-btn-inline.down').classList.toggle('active', result.user_vote === -1);
        } catch (err) { Toast.show(err.message, 'error'); }
    },

    quickAiInfo(dealId) {
        if (!Auth.isLoggedIn()) { Toast.show('AI doğrulama için giriş yapın.', 'error'); return; }
        this.openDetail(dealId);
    },

    async openDetail(dealId) {
        try {
            const deal = await API.getDeal(dealId);
            const commentsData = await API.getComments(dealId);
            this.renderDetail(deal, commentsData);
            Modal.open('dealDetailModal');
        } catch (err) { Toast.show('Fırsat yüklenemedi.', 'error'); }
    },

    renderDetail(deal, commentsData) {
        const container = document.getElementById('dealDetailContent');
        document.getElementById('detailTitle').textContent = deal.title;

        const imgHtml = deal.image_url
            ? `<img src="${escapeHtml(deal.image_url)}" alt="" style="width:100%;max-height:300px;object-fit:contain;background:#F5F7FA;border-radius:var(--radius-md);margin-bottom:16px;padding:16px;" onerror="this.style.display='none'">`
            : '';

        const priceHtml = deal.price
            ? `<div style="margin:12px 0;display:flex;align-items:baseline;gap:12px;">
                <span style="font-size:1.4rem;font-weight:800;color:var(--mint);">${formatPriceTL(deal.price)}</span>
                ${deal.old_price ? `<span style="font-size:0.9rem;color:var(--text-light);text-decoration:line-through;">${formatPriceTL(deal.old_price)}</span>` : ''}
                ${deal.discount_percent > 0 ? `<span style="font-size:0.82rem;font-weight:700;color:var(--coral);background:rgba(255,107,107,0.1);padding:3px 10px;border-radius:20px;">%${deal.discount_percent}</span>` : ''}
               </div>` : '';

        const linkHtml = deal.link
            ? `<a href="${escapeHtml(deal.link)}" target="_blank" rel="noopener" class="btn btn-primary mt-md" style="display:inline-flex;">🔗 Fırsata Git</a>` : '';

        const couponHtml = deal.coupon_code
            ? `<div class="coupon-box" style="margin-top:10px;"><span>🎟️</span><span class="coupon-code">${escapeHtml(deal.coupon_code)}</span><button class="coupon-copy-btn" onclick="copyToClipboard('${escapeHtml(deal.coupon_code)}')">Kopyala</button></div>` : '';

        // AI
        let aiHtml = '';
        if (deal.ai_score) {
            let pcHtml = '';
            if (deal.ai_price_comparison && Array.isArray(deal.ai_price_comparison)) {
                pcHtml = deal.ai_price_comparison.map((p, i) => `<div class="ai-price-row ${i === 0 ? 'ai-price-cheapest' : ''}"><span>${escapeHtml(p.store)}</span><span>${formatPriceTL(p.price)}</span></div>`).join('');
            }
            aiHtml = `<div class="ai-card"><div class="ai-card-header">🤖 AI Doğrulama Raporu</div><div class="ai-score-display"><span class="ai-score-number">${deal.ai_score}/10</span><div class="ai-score-bar"><div class="ai-score-fill" style="width:${deal.ai_score * 10}%"></div></div></div>${deal.ai_summary ? `<p class="ai-summary-text">${escapeHtml(deal.ai_summary)}</p>` : ''}${pcHtml ? `<div class="ai-price-table">${pcHtml}</div>` : ''}</div>`;
        } else if (Auth.isLoggedIn()) {
            aiHtml = `<div class="ai-card" style="text-align:center;"><button class="btn btn-sm" style="background:var(--mint);color:white;" onclick="Deals.runAiVerify('${deal.id}')">🤖 AI ile Doğrula</button></div>`;
        }

        const commentsHtml = this.renderComments(commentsData.comments, deal.id);

        container.innerHTML = `
            ${imgHtml}
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                ${deal.store_name ? `<span style="font-size:0.78rem;font-weight:600;color:var(--mint);background:var(--mint-light);padding:3px 10px;border-radius:20px;">${escapeHtml(deal.store_name)}</span>` : ''}
                ${deal.category_name ? `<span style="font-size:0.75rem;color:var(--text-light);">${deal.category_icon || ''} ${escapeHtml(deal.category_name)}</span>` : ''}
                <span style="font-size:0.72rem;color:var(--text-light);margin-left:auto;">⏰ ${timeAgo(deal.created_at)}</span>
            </div>
            ${priceHtml}
            ${deal.description ? `<p style="color:var(--text-medium);line-height:1.6;margin:12px 0;font-size:0.9rem;">${escapeHtml(deal.description)}</p>` : ''}
            ${couponHtml}${linkHtml}${aiHtml}
            <div style="margin-top:14px;display:flex;align-items:center;gap:10px;padding-top:14px;border-top:var(--border-light);">
                <span class="deal-card-user-avatar" style="width:26px;height:26px;font-size:0.7rem;">${deal.userLevel ? deal.userLevel.badge : '🌱'}</span>
                <span style="font-weight:600;font-size:0.82rem;">@${escapeHtml(deal.username || 'anonim')}</span>
                <span style="font-size:0.78rem;color:var(--text-light);">👁 ${deal.view_count || 0} görüntülenme</span>
                <span class="report-btn" onclick="Deals.reportDeal('${deal.id}')" style="margin-left:auto;" title="Raporla">🚩</span>
            </div>
            <div class="share-buttons">
                <a class="share-btn whatsapp" href="https://wa.me/?text=${encodeURIComponent(deal.title + ' - ' + (deal.link || location.href))}" target="_blank" rel="noopener">📱 WhatsApp</a>
                <a class="share-btn telegram" href="https://t.me/share/url?url=${encodeURIComponent(deal.link || location.href)}&text=${encodeURIComponent(deal.title)}" target="_blank" rel="noopener">✈️ Telegram</a>
                <a class="share-btn twitter" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(deal.title)}&url=${encodeURIComponent(deal.link || location.href)}" target="_blank" rel="noopener">🐦 Twitter</a>
                <button class="share-btn copy-link" onclick="copyToClipboard('${escapeHtml(deal.link || location.href)}')">🔗 Kopyala</button>
            </div>
            <div style="margin-top:20px;">
                <h4 style="font-size:0.95rem;font-weight:700;margin-bottom:14px;">💬 Yorumlar (${commentsData.total || 0})</h4>
                ${Auth.isLoggedIn() ? `<div style="margin-bottom:14px;"><textarea class="form-input" id="newCommentInput" placeholder="Yorumunuzu yazın..." style="min-height:65px;"></textarea><button class="btn btn-primary btn-sm mt-sm" onclick="Deals.submitComment('${deal.id}')">Yorum Yap</button></div>` : `<p class="text-sm text-muted mb-md">Yorum yapmak için <a href="#" onclick="Modal.open('authModal');return false;">giriş yapın</a>.</p>`}
                <div id="commentsContainer">${commentsHtml}</div>
            </div>`;
    },

    renderComments(comments, dealId) {
        if (!comments || comments.length === 0) return '<p class="text-sm text-muted">Henüz yorum yok. İlk yorumu sen yap!</p>';
        return comments.map(c => {
            const repliesHtml = c.replies && c.replies.length > 0
                ? `<div class="replies">${c.replies.map(r => this.renderSingleComment(r, dealId)).join('')}</div>` : '';
            return this.renderSingleComment(c, dealId) + repliesHtml;
        }).join('');
    },

    renderSingleComment(c, dealId) {
        const level = c.userLevel || { badge: '🌱', label: 'Çaylak', color: '#636E72' };
        const user = API.getUser();
        const isOwner = user && user.id === c.user_id;
        return `
        <div class="comment-item" id="comment-${c.id}">
            <div class="comment-avatar">${escapeHtml(c.username ? c.username[0].toUpperCase() : '?')}</div>
            <div class="comment-body">
                <div class="comment-header">
                    <span class="comment-username">@${escapeHtml(c.username || 'anonim')}</span>
                    <span class="comment-level-badge" style="background:${level.color}20;color:${level.color};">${level.badge} ${level.label}</span>
                    <span class="comment-time">${timeAgo(c.created_at)}</span>
                </div>
                <div class="comment-content">${escapeHtml(c.content)}</div>
                <div class="comment-actions">
                    ${Auth.isLoggedIn() ? `<span class="comment-action" onclick="Deals.toggleReplyForm('${c.id}','${dealId}')">↩ Yanıtla</span>` : ''}
                    ${isOwner ? `<span class="comment-action" style="color:var(--coral);" onclick="Deals.deleteComment('${c.id}','${dealId}')">🗑 Sil</span>` : ''}
                </div>
                <div class="reply-form hidden" id="replyForm-${c.id}">
                    <textarea class="form-input" id="replyInput-${c.id}" placeholder="Yanıtınız..." style="min-height:50px;margin-top:6px;"></textarea>
                    <button class="btn btn-primary btn-sm mt-sm" onclick="Deals.submitReply('${dealId}','${c.id}')">Yanıtla</button>
                </div>
            </div>
        </div>`;
    },

    toggleReplyForm(commentId) { document.getElementById(`replyForm-${commentId}`)?.classList.toggle('hidden'); },

    async submitComment(dealId) {
        const input = document.getElementById('newCommentInput');
        const content = input.value.trim();
        if (!content) return;
        try { await API.createComment(dealId, content); input.value = ''; Toast.show('Yorum eklendi! 💬'); const d = await API.getComments(dealId); document.getElementById('commentsContainer').innerHTML = this.renderComments(d.comments, dealId); } catch (e) { Toast.show(e.message, 'error'); }
    },

    async submitReply(dealId, parentId) {
        const input = document.getElementById(`replyInput-${parentId}`);
        const content = input.value.trim();
        if (!content) return;
        try { await API.createComment(dealId, content, parentId); input.value = ''; Toast.show('Yanıt eklendi!'); const d = await API.getComments(dealId); document.getElementById('commentsContainer').innerHTML = this.renderComments(d.comments, dealId); } catch (e) { Toast.show(e.message, 'error'); }
    },

    async deleteComment(cId, dealId) {
        const confirmed = await ConfirmModal.show({
            title: 'Yorumu Sil',
            message: 'Bu yorumu silmek istediğinize emin misiniz?',
            icon: '🗑️',
            okText: 'Evet, Sil',
            cancelText: 'İptal'
        });
        if (!confirmed) return;
        try { await API.deleteComment(cId); Toast.show('Yorum silindi.'); const d = await API.getComments(dealId); document.getElementById('commentsContainer').innerHTML = this.renderComments(d.comments, dealId); } catch (e) { Toast.show(e.message, 'error'); }
    },

    async runAiVerify(dealId) {
        Toast.show('🤖 AI doğrulama başlatıldı...');
        try { const r = await API.verifyDeal(dealId); Toast.show(`AI Skoru: ${r.score}/10`); this.openDetail(dealId); } catch (e) { Toast.show(e.message, 'error'); }
    },

    goToPage(page) { this.currentPage = page; App.loadDeals(); window.scrollTo({ top: 0, behavior: 'smooth' }); },

    bindSubmitButtons() {
        document.querySelectorAll('.submit-deal-btn').forEach(btn => {
            btn.addEventListener('click', () => { if (!Auth.isLoggedIn()) { Modal.open('authModal'); return; } Modal.open('submitModal'); });
        });
    },

    async toggleFavorite(dealId, btn) {
        if (!Auth.isLoggedIn()) { Modal.open('authModal'); return; }
        try {
            const result = await API.favoriteDeal(dealId);
            btn.textContent = result.favorited ? '❤️' : '🤍';
            btn.style.transform = 'scale(1.3)';
            setTimeout(() => btn.style.transform = '', 300);
            Toast.show(result.message, 'success', 2000);
        } catch (err) { Toast.show(err.message, 'error'); }
    },

    async reportDeal(dealId) {
        if (!Auth.isLoggedIn()) { Modal.open('authModal'); return; }
        const reason = prompt('Bu fırsatı neden raporluyorsunuz?');
        if (!reason || reason.length < 5) {
            if (reason !== null) Toast.show('Rapor nedeni en az 5 karakter olmalı.', 'error');
            return;
        }
        try {
            await API.reportContent('deal', dealId, reason);
            Toast.show('🚩 Rapor gönderildi. Teşekkürler!', 'success');
        } catch (err) { Toast.show(err.message, 'error'); }
    },

    getStoreLogo(storeName) {
        if (!storeName) return '🏪';
        const s = storeName.toLowerCase();
        const logos = {
            'trendyol': '🟠',
            'hepsiburada': '🟡',
            'amazon': '📦',
            'n11': '🔵',
            'bim': '🔴',
            'a101': '🟢',
            'şok': '⚡',
            'migros': '🟤',
            'mediamarkt': '🔶',
            'teknosa': '💜',
            'boyner': '🟣',
            'lcw': '👕',
            'defacto': '👗',
            'koton': '🧥',
            'gratis': '💅',
            'watsons': '💊',
            'pttavm': '📮',
            'gittigidiyor': '🔨',
            'çiçeksepeti': '🌸',
            'yemeksepeti': '🍕',
            'getir': '💜',
            'starbucks': '☕',
        };
        for (const [key, emoji] of Object.entries(logos)) {
            if (s.includes(key)) return emoji;
        }
        return '🏪';
    }
};
