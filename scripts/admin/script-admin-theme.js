// Admin theme toggle (dark/light mode)
(function() {
  // Check for saved theme preference or default to light mode
  const currentTheme = localStorage.getItem('admin-theme') || 'light';

  // Apply theme immediately to prevent flash
  document.documentElement.setAttribute('data-theme', currentTheme);

  // Wait for DOM to be ready to attach click handler
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
  } else {
    initTheme();
  }

  function initTheme() {
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      // Add click handler
      toggle.addEventListener('click', toggleTheme);
    }
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('admin-theme', newTheme);
  }

  // Make toggleTheme available globally as well
  window.toggleAdminTheme = toggleTheme;
})();
