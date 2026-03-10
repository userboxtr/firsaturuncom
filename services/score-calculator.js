/**
 * Sıcaklık Skoru Hesaplama Servisi
 * Fırsatların sıcaklık derecesini hesaplar (Reddit/HN benzeri algoritma)
 */

function calculateHotScore(upvotes, downvotes, createdAt) {
    const netVotes = upvotes - downvotes;
    const createdTime = new Date(createdAt).getTime();
    const now = Date.now();
    const hoursSinceCreated = (now - createdTime) / (1000 * 60 * 60);

    // Zaman bazlı azalma - yeni fırsatlar avantajlı
    const timeFactor = 1 / Math.pow(1 + hoursSinceCreated / 12, 1.5);

    // Net oy logaritmik ağırlık
    const voteFactor = netVotes > 0
        ? Math.log2(netVotes + 1) * 10
        : netVotes < 0
            ? -Math.log2(Math.abs(netVotes) + 1) * 5
            : 0;

    return Math.round((voteFactor * timeFactor) * 100) / 100;
}

function getHeatLevel(score) {
    if (score >= 200) return { level: 'alevli', emoji: '🔥🔥🔥', label: 'Alevli Fırsat' };
    if (score >= 100) return { level: 'sicak', emoji: '🔥🔥', label: 'Sıcak Fırsat' };
    if (score >= 20) return { level: 'ilik', emoji: '🔥', label: 'İyi Fırsat' };
    if (score >= 0) return { level: 'normal', emoji: '➖', label: 'Normal' };
    if (score > -10) return { level: 'soguk', emoji: '❄️', label: 'Soğuk' };
    return { level: 'gizli', emoji: '💀', label: 'Gizlendi' };
}

function getUserLevel(points) {
    if (points >= 10000) return { level: 'efsane', label: 'Forum Efsanesi', badge: '👑', color: '#FFD700' };
    if (points >= 2000) return { level: 'super', label: 'Süper Katkıcı', badge: '⭐', color: '#FF6B6B' };
    if (points >= 500) return { level: 'sicak', label: 'Sıcak Paylaşımcı', badge: '🥈', color: '#4ECDC4' };
    if (points >= 100) return { level: 'avci', label: 'Fırsat Avcısı', badge: '🥉', color: '#74B9FF' };
    return { level: 'caylak', label: 'Çaylak', badge: '🌱', color: '#636E72' };
}

module.exports = { calculateHotScore, getHeatLevel, getUserLevel };
