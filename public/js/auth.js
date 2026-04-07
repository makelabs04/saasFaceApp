// Shared auth utilities
const Auth = {
    async check(redirect = true) {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (!data.loggedIn && redirect) {
            window.location.href = '/';
            return null;
        }
        return data;
    },

    async logout() {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/';
    },

    async setupNav() {
        const data = await this.check();
        if (!data) return;
        const el = document.getElementById('userNameBadge');
        if (el) {
            el.textContent = data.name;
            const av = document.getElementById('userAvatar');
            if (av) av.textContent = data.name.charAt(0).toUpperCase();
        }
        return data;
    }
};

// Highlight active nav link
document.querySelectorAll('.nav-link').forEach(link => {
    if (link.href === window.location.href) link.classList.add('active');
});

function showAlert(msg, type = 'info', container = 'alertBox') {
    const el = document.getElementById(container);
    if (!el) return;
    const icons = { success: '✅', danger: '❌', info: 'ℹ️', warning: '⚠️' };
    el.innerHTML = `<div class="alert alert-${type}">${icons[type] || ''} ${msg}</div>`;
    setTimeout(() => { el.innerHTML = ''; }, 5000);
}
