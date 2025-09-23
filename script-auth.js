// /script-auth.js — mounts Clerk on each page & unlocks higher tiers on Order
window.addEventListener('load', async () => {
  try {
    if (!window.Clerk) return;
    await window.Clerk.load();

    const authBtns   = document.querySelector('.auth-buttons');
    const userMount  = document.getElementById('user-button');
    const btnLogin   = document.getElementById('btn-login');
    const btnSignup  = document.getElementById('btn-signup');
    const btnSignout = document.getElementById('btn-signout'); // may not exist

    const authed = !!window.Clerk.user;

    if (authed) {
      if (userMount) window.Clerk.mountUserButton(userMount);
      document.body.classList.add('authed');
      if (authBtns)   authBtns.style.display = 'none';
      if (btnSignout) btnSignout.style.display = 'inline-flex';
      // Unlock higher tiers on order page
      document.querySelectorAll('.tier.locked').forEach(btn => {
        btn.classList.remove('locked');
        btn.removeAttribute('disabled');
        const lock = btn.querySelector('.tier-lock');
        if (lock) lock.remove();
      });
    } else {
      document.body.classList.remove('authed');
      if (authBtns)   authBtns.style.display = '';
      if (btnSignout) btnSignout.style.display = 'none';
    }

    if (btnLogin)  btnLogin.addEventListener('click', () => window.Clerk.openSignIn());
    if (btnSignup) btnSignup.addEventListener('click', () => window.Clerk.openSignUp());
    if (btnSignout) btnSignout.addEventListener('click', () => window.Clerk.signOut());
  } catch {}
});
