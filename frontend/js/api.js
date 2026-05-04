// ── Cấu hình API gốc ──
const API_BASE = '/api';

// ── Lấy token từ localStorage ──
const getToken = () => localStorage.getItem('token');
const getUser = () => JSON.parse(localStorage.getItem('user') || 'null');

// ── Hàm gọi API tập trung ──
async function api(method, endpoint, body = null, requireAuth = false) {
    const headers = { 'Content-Type': 'application/json' };

    if (requireAuth) {
        const token = getToken();
        if (!token) {
            window.location.href = '/login.html';
            return;
        }
        headers['Authorization'] = 'Bearer ' + token;
    }

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
        const res = await fetch(API_BASE + endpoint, options);
        const data = await res.json();

        // Token hết hạn → logout
        if (res.status === 401) {
            localStorage.clear();
            window.location.href = '/login.html';
            return;
        }

        return data;
    } catch (err) {
        return { success: false, message: 'Không thể kết nối đến server.' };
    }
}

// ── Shorthand helpers ──
const GET = (url, auth = false) => api('GET', url, null, auth);
const POST = (url, body, auth = false) => api('POST', url, body, auth);
const PATCH = (url, body, auth = true) => api('PATCH', url, body, auth);
const DELETE = (url, auth = true) => api('DELETE', url, null, auth);

// ── Format helpers ──
const formatPrice = (n) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);

const formatDate = (d) =>
    new Date(d).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

const formatTime = (d) =>
    new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

const formatDateTime = (d) => `${formatTime(d)} · ${formatDate(d)}`;

// ── Toast thông báo ──
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn .3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ── Status badge helper ──
function statusBadge(status) {
    const map = {
        pending_payment: ['badge-amber', 'Chờ thanh toán'],
        paid: ['badge-green', 'Đã thanh toán'],
        payment_failed: ['badge-red', 'TT thất bại'],
        expired: ['badge-gray', 'Hết hạn'],
        cancelled: ['badge-red', 'Đã hủy'],
        cancelled_by_operator: ['badge-red', 'Nhà xe hủy'],
        completed: ['badge-blue', 'Hoàn thành'],
        pending: ['badge-amber', 'Chờ duyệt'],
        approved: ['badge-green', 'Đã duyệt'],
        blocked: ['badge-red', 'Đã khóa'],
        scheduled: ['badge-blue', 'Đã lên lịch'],
    };
    const [cls, label] = map[status] || ['badge-gray', status];
    return `<span class="badge ${cls}">${label}</span>`;
}
