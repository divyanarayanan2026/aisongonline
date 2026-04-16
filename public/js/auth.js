/* ── AI Song Generator — Auth Module ──────────────────────────────────────── */
'use strict';

const Auth = (() => {
  let _token = localStorage.getItem('aisg_token') || null;
  let _user  = JSON.parse(localStorage.getItem('aisg_user') || 'null');
  let _usage = JSON.parse(localStorage.getItem('aisg_usage') || 'null');

  function getToken()  { return _token; }
  function getUser()   { return _user; }
  function getUsage()  { return _usage; }
  function isLoggedIn(){ return !!_token && !!_user; }

  function setSession(token, user, usage) {
    _token = token; _user = user; _usage = usage;
    if (token) {
      localStorage.setItem('aisg_token', token);
      localStorage.setItem('aisg_user', JSON.stringify(user));
      localStorage.setItem('aisg_usage', JSON.stringify(usage || null));
    } else {
      localStorage.removeItem('aisg_token');
      localStorage.removeItem('aisg_user');
      localStorage.removeItem('aisg_usage');
    }
    updateHeaderUI();
    updateUsageBanner();
  }

  function logout() {
    setSession(null, null, null);
  }

  function authHeaders() {
    return _token ? { 'Authorization': `Bearer ${_token}` } : {};
  }

  // ── Header UI ──────────────────────────────────────────────────────────────
  function updateHeaderUI() {
    const authBtns  = document.getElementById('headerAuthBtns');
    const userChip  = document.getElementById('headerUserChip');
    const userName  = document.getElementById('headerUserName');
    const planBadge = document.getElementById('headerPlanBadge');

    if (!authBtns) return;

    if (isLoggedIn()) {
      authBtns.classList.add('hidden');
      userChip.classList.remove('hidden');
      if (userName)  userName.textContent  = _user.name.split(' ')[0];
      if (planBadge) {
        planBadge.textContent = _user.plan === 'free' ? 'Free' : _user.plan === 'starter' ? 'Starter' : 'Pro';
        planBadge.className = `plan-badge plan-${_user.plan}`;
      }
    } else {
      authBtns.classList.remove('hidden');
      if (userChip) userChip.classList.add('hidden');
    }
  }

  // ── Usage Banner ───────────────────────────────────────────────────────────
  function updateUsageBanner() {
    const banner = document.getElementById('usageBanner');
    if (!banner) return;

    if (!isLoggedIn()) {
      banner.innerHTML = `
        <span>🎵 <strong>3 free songs</strong> available without signing in —
        <a href="#" class="banner-link" id="bannerSignUp">Sign up free</a> for 5/month
        </span>`;
      document.getElementById('bannerSignUp')?.addEventListener('click', e => { e.preventDefault(); openSignUp(); });
      banner.classList.remove('hidden');
      return;
    }

    const u = _usage;
    if (!u) return banner.classList.add('hidden');

    const { used, limit } = u;
    const pct = Math.min(Math.round((used / limit) * 100), 100);
    const remaining = Math.max(limit - used, 0);
    const planName = _user.plan === 'free' ? 'Free' : _user.plan === 'starter' ? 'Starter' : 'Pro';

    if (_user.plan === 'pro') {
      banner.innerHTML = `<span>🚀 <strong>Pro plan</strong> — Unlimited songs · ${used} generated this month</span>`;
    } else if (remaining <= 0) {
      banner.innerHTML = `
        <span>⚠️ You've used all <strong>${limit} songs</strong> this month.
        <a href="#" class="banner-link banner-upgrade" id="bannerUpgrade">Upgrade now →</a>
        </span>`;
      document.getElementById('bannerUpgrade')?.addEventListener('click', e => { e.preventDefault(); openPricing(); });
    } else {
      banner.innerHTML = `
        <span>
          <strong>${planName}</strong> · ${remaining} songs left this month
          <span class="usage-bar-wrap"><span class="usage-bar-fill" style="width:${pct}%"></span></span>
          ${remaining <= 2 && _user.plan !== 'pro' ? `<a href="#" class="banner-link banner-upgrade" id="bannerUpgrade">Upgrade →</a>` : ''}
        </span>`;
      document.getElementById('bannerUpgrade')?.addEventListener('click', e => { e.preventDefault(); openPricing(); });
    }
    banner.classList.remove('hidden');
  }

  // Refresh usage from server
  async function refreshMe() {
    if (!_token) return;
    try {
      const r = await fetch('/api/auth/me', { headers: authHeaders() });
      if (r.status === 401) { logout(); return; }
      const d = await r.json();
      _user  = d.user;
      _usage = d.usage;
      localStorage.setItem('aisg_user', JSON.stringify(_user));
      localStorage.setItem('aisg_usage', JSON.stringify(_usage));
      updateHeaderUI();
      updateUsageBanner();
    } catch {}
  }

  // ── Modals ─────────────────────────────────────────────────────────────────
  function openSignIn()  { closeAllModals(); document.getElementById('signInModal')?.classList.remove('hidden'); }
  function openSignUp()  { closeAllModals(); document.getElementById('signUpModal')?.classList.remove('hidden'); }
  function openPricing() { closeAllModals(); document.getElementById('pricingModal')?.classList.remove('hidden'); }
  function openContact() { closeAllModals(); document.getElementById('contactModal')?.classList.remove('hidden'); }

  function closeAllModals() {
    ['signInModal','signUpModal','pricingModal','contactModal'].forEach(id => {
      document.getElementById(id)?.classList.add('hidden');
    });
  }

  // ── Sign In Form ───────────────────────────────────────────────────────────
  function initSignIn() {
    const form = document.getElementById('signInForm');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email    = document.getElementById('siEmail').value.trim();
      const password = document.getElementById('siPassword').value;
      const errEl    = document.getElementById('siError');
      const btn      = form.querySelector('button[type=submit]');

      errEl.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Signing in…';

      try {
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error);
        setSession(d.token, d.user, d.usage);
        closeAllModals();
        showToastGlobal(`Welcome back, ${d.user.name.split(' ')[0]}! 👋`, 'success');
      } catch (err) {
        errEl.textContent = err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    });

    document.getElementById('siToSignUp')?.addEventListener('click', e => { e.preventDefault(); openSignUp(); });
  }

  // ── Sign Up Form ───────────────────────────────────────────────────────────
  function initSignUp() {
    const form = document.getElementById('signUpForm');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const name     = document.getElementById('suName').value.trim();
      const email    = document.getElementById('suEmail').value.trim();
      const password = document.getElementById('suPassword').value;
      const errEl    = document.getElementById('suError');
      const btn      = form.querySelector('button[type=submit]');

      errEl.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Creating account…';

      try {
        const r = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error);
        setSession(d.token, d.user, { used: 0, limit: 5 });
        closeAllModals();
        showToastGlobal(`Welcome to AISongOnline, ${d.user.name.split(' ')[0]}! 🎵`, 'success');
      } catch (err) {
        errEl.textContent = err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create Free Account';
      }
    });

    document.getElementById('suToSignIn')?.addEventListener('click', e => { e.preventDefault(); openSignIn(); });
  }

  // ── Pricing: Stripe checkout ───────────────────────────────────────────────
  function initPricing() {
    document.querySelectorAll('.pricing-cta-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const plan = btn.dataset.plan;
        if (plan === 'free') {
          if (!isLoggedIn()) openSignUp();
          else closeAllModals();
          return;
        }

        if (!isLoggedIn()) {
          openSignUp();
          showToastGlobal('Create a free account first, then upgrade!', '');
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Loading…';

        try {
          const r = await fetch('/api/stripe/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ plan }),
          });
          const d = await r.json();
          if (!d.success) throw new Error(d.error);
          window.location.href = d.url;
        } catch (err) {
          showToastGlobal(err.message, 'error');
          btn.disabled = false;
          btn.textContent = plan === 'starter' ? 'Get Starter' : 'Get Pro';
        }
      });
    });
  }

  // ── Contact Form ───────────────────────────────────────────────────────────
  function initContact() {
    const form = document.getElementById('contactForm');
    if (!form) return;

    // Pre-fill if logged in
    if (isLoggedIn()) {
      const nameEl  = document.getElementById('cfName');
      const emailEl = document.getElementById('cfEmail');
      if (nameEl  && !nameEl.value)  nameEl.value  = _user.name;
      if (emailEl && !emailEl.value) emailEl.value = _user.email;
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const name    = document.getElementById('cfName').value.trim();
      const email   = document.getElementById('cfEmail').value.trim();
      const subject = document.getElementById('cfSubject').value.trim();
      const message = document.getElementById('cfMessage').value.trim();
      const errEl   = document.getElementById('cfError');
      const btn     = form.querySelector('button[type=submit]');

      errEl.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Sending…';

      try {
        const r = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, subject, message }),
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error);
        form.reset();
        closeAllModals();
        showToastGlobal('Message sent! We\'ll get back to you soon 💌', 'success');
      } catch (err) {
        errEl.textContent = err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send Message';
      }
    });
  }

  // ── Global toast helper ────────────────────────────────────────────────────
  let _toastTimer;
  function showToastGlobal(msg, type) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast${type ? ' ' + type : ''}`;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    // Header buttons
    document.getElementById('headerSignInBtn')?.addEventListener('click', openSignIn);
    document.getElementById('headerSignUpBtn')?.addEventListener('click', openSignUp);
    document.getElementById('headerLogoutBtn')?.addEventListener('click', () => {
      logout();
      showToastGlobal('Signed out', '');
    });
    document.getElementById('headerPricingBtn')?.addEventListener('click', openPricing);
    document.getElementById('footerContactBtn')?.addEventListener('click', e => { e.preventDefault(); openContact(); });

    // Modal close buttons
    document.querySelectorAll('.auth-modal-close').forEach(btn => {
      btn.addEventListener('click', closeAllModals);
    });
    document.querySelectorAll('.auth-modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => { if (e.target === overlay) closeAllModals(); });
    });

    // Nav pricing button
    document.getElementById('navPricingBtn')?.addEventListener('click', openPricing);

    // Payment success/cancelled callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      const plan = params.get('plan') || 'starter';
      showToastGlobal(`🎉 Welcome to ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan!`, 'success');
      refreshMe();
      window.history.replaceState({}, '', '/');
    } else if (params.get('payment') === 'cancelled') {
      showToastGlobal('Payment cancelled — no charge was made', '');
      window.history.replaceState({}, '', '/');
    }

    initSignIn();
    initSignUp();
    initPricing();
    initContact();
    updateHeaderUI();
    updateUsageBanner();

    // Refresh auth state from server on load
    if (_token) refreshMe();

    // Expose openContact for footer link
    window._openContact = openContact;
    window._openPricing = openPricing;
    window._openSignUp  = openSignUp;
  }

  return { init, getToken, getUser, getUsage, isLoggedIn, authHeaders, logout, openSignIn, openSignUp, openPricing, openContact, refreshMe };
})();

document.addEventListener('DOMContentLoaded', () => Auth.init());
