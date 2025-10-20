// Admin theme toggle (dark/light mode)
(function() {
  // Check for saved theme preference or default to light mode
  const currentTheme = localStorage.getItem('admin-theme') || 'light';

  // Apply theme immediately to prevent flash
  document.documentElement.setAttribute('data-theme', currentTheme);

  // Wait for DOM to be ready to update button icon
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateButtonIcon);
  } else {
    updateButtonIcon();
  }

  function updateButtonIcon() {
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      const theme = document.documentElement.getAttribute('data-theme') || 'light';
      toggle.innerHTML = theme === 'dark' ? '☀️' : '🌙';
    }
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
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
