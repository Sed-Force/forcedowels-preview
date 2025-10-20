// Admin authentication check
// Include this script at the top of every admin page

(function() {
  // Check if user is authenticated
  const isAuthenticated = sessionStorage.getItem('admin_authenticated') === 'true';
  
  if (!isAuthenticated) {
    // Redirect to login page
    window.location.href = '/admin-login.html';
  }
})();

// Add logout functionality
function adminLogout() {
  if (confirm('Are you sure you want to log out?')) {
    sessionStorage.removeItem('admin_authenticated');
    sessionStorage.removeItem('admin_username');
    window.location.href = '/admin-login.html';
  }
}

