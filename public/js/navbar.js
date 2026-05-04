// Navbar HTML injector
function injectNavbar() {
    const nav = document.getElementById('mainNav');
    if (!nav) return;
    nav.innerHTML = `
    <nav class="navbar">
        <a href="/dashboard" class="navbar-brand">
            <div class="brand-icon">👁️</div>
            <span class="brand-name">Face<span>ID</span></span>
        </a>
        <div class="nav-links">
            <a href="/dashboard" class="nav-link" data-page="dashboard">🏠 Dashboard</a>
            <a href="/register-face" class="nav-link" data-page="register-face">➕ Register Face</a>
            <a href="/recognize" class="nav-link" data-page="recognize">🔍 Recognize</a>
            <a href="/persons" class="nav-link" data-page="persons">👥 Persons</a>
        </div>
        <div class="nav-right">
            <div class="user-badge">
                <div class="user-avatar" id="userAvatar">U</div>
                <span id="userNameBadge">User</span>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Auth.logout()">Logout</button>
        </div>
    </nav>`;

    // Mark active
    const path = window.location.pathname.replace('/', '');
    document.querySelectorAll('.nav-link[data-page]').forEach(link => {
        link.classList.toggle('active', link.dataset.page === path);
    });
}
injectNavbar();
