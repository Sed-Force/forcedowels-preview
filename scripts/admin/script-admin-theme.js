// Admin theme toggle (dark/light mode)
(function() {
  // Check for saved theme preference or default to light mode
  const currentTheme = localStorage.getItem('admin-theme') || 'light';

  // Apply theme immediately to prevent flash
  document.documentElement.setAttribute('data-theme', currentTheme);

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeToggle);
  } else {
    initThemeToggle();
  }

  function initThemeToggle() {
    // Create theme toggle button
    const themeToggle = document.createElement('button');
    themeToggle.id = 'theme-toggle';
    themeToggle.className = 'theme-toggle-btn';
    themeToggle.innerHTML = currentTheme === 'dark' ? '☀️' : '🌙';
    themeToggle.setAttribute('aria-label', 'Toggle theme');
    themeToggle.setAttribute('title', 'Toggle dark mode');
    themeToggle.style.cssText = 'background: none; border: none; font-size: 20px; cursor: pointer; padding: 6px 12px; border-radius: 4px; transition: background 0.2s; line-height: 1;';
    themeToggle.onclick = toggleTheme;

    // Hover effect
    themeToggle.onmouseover = function() {
      this.style.background = 'rgba(255,255,255,0.1)';
    };
    themeToggle.onmouseout = function() {
      this.style.background = 'none';
    };

    // Add to nav (before logout link)
    const nav = document.querySelector('.admin-nav');
    const logoutLink = nav?.querySelector('a[onclick*="adminLogout"]');
    if (nav && logoutLink) {
      nav.insertBefore(themeToggle, logoutLink);
    } else if (nav) {
      // If no logout link, just append to nav
      nav.appendChild(themeToggle);
    }
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('admin-theme', newTheme);

    // Update button icon
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.innerHTML = newTheme === 'dark' ? '☀️' : '🌙';
    }
  }

  // Make toggleTheme available globally
  window.toggleAdminTheme = toggleTheme;
})();
