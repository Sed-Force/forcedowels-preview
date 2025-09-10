<!-- keep your existing Clerk loader in <head> -->
<script>
  window.addEventListener('load', async () => {
    try {
      if (!window.Clerk) return;
      await window.Clerk.load();

      // Show Clerk user button when signed in, hide auth buttons
      const userBtn = document.getElementById('user-button');
      const authBtns = document.querySelector('.auth-buttons');
      if (window.Clerk.user) {
        if (userBtn) window.Clerk.mountUserButton(userBtn);
        document.body.classList.add('authed');
        if (authBtns) authBtns.style.display = 'none';
      } else {
        document.body.classList.remove('authed');
        if (authBtns) authBtns.style.display = 'flex';
      }

      // Hook up the Login / Sign Up buttons
      const btnLogin = document.getElementById('btn-login');
      const btnSignup = document.getElementById('btn-signup');
      if (btnLogin) btnLogin.onclick = () => window.Clerk.openSignIn();
      if (btnSignup) btnSignup.onclick = () => window.Clerk.openSignUp();
    } catch (e) { /* no-op */ }
  });
</script>

