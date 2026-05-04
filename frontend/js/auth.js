// ── Quản lý xác thực và session ──

// Lưu thông tin đăng nhập
function saveAuth(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
}

// Xóa session
function logout() {
    localStorage.clear();
    showToast('Đã đăng xuất.', 'info');
    setTimeout(() => window.location.href = '/frontend/index.html', 800);
}

// Kiểm tra đã đăng nhập chưa
function isLoggedIn() {
    return !!localStorage.getItem('token');
}

// Lấy role hiện tại
function getRole() {
    const user = getUser();
    return user?.role || null;
}

// Render navbar động dựa theo trạng thái đăng nhập
function renderNavbar(activePage = '') {
    const user = getUser();
    const loggedIn = isLoggedIn();

    const navLinks = loggedIn ? `
    <a class="nav-link ${activePage === 'home' ? 'active' : ''}" href="/frontend/index.html">Trang chủ</a>
    ${user?.role === 'operator' ? `<a class="nav-link ${activePage === 'operator' ? 'active' : ''}" href="/frontend/operator.html">Quản lý nhà xe</a>` : ''}
    ${user?.role === 'admin' ? `<a class="nav-link ${activePage === 'admin' ? 'active' : ''}" href="/frontend/admin.html">Quản trị</a>` : ''}
    ${user?.role === 'customer' || user?.role === 'operator' ? `<a class="nav-link ${activePage === 'bookings' ? 'active' : ''}" href="/frontend/my-bookings.html">Vé của tôi</a>` : ''}
    <div style="width:1px;height:24px;background:rgba(255,255,255,.15)"></div>
    <span class="nav-link" style="color:rgba(255,255,255,.75)">${user?.full_name}</span>
    <button class="btn-nav" onclick="logout()" style="background:rgba(255,255,255,.1);color:#fff">Đăng xuất</button>
  ` : `
    <a class="nav-link ${activePage === 'home' ? 'active' : ''}" href="/frontend/index.html">Trang chủ</a>
    <a class="nav-link" href="/frontend/login.html">Đăng nhập</a>
    <a href="/frontend/register.html"><button class="btn-nav">Đăng ký</button></a>
  `;

    const navbar = document.getElementById('navbar');
    if (navbar) {
        navbar.innerHTML = `
      <a class="navbar-brand" href="/frontend/index.html">
        <span class="dot"></span> BusGo
      </a>
      <div class="navbar-links">${navLinks}</div>
    `;
    }
}
