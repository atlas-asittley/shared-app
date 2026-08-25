/* App shell: Google auth, the two-person gate, and the tool registry.
   Tools register themselves on window.SharedTools before this file runs. */
(function () {
  'use strict';

  var cfg = window.SHARED_CONFIG;
  var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  var allowed = cfg.ALLOWED_EMAILS.map(function (e) { return e.trim().toLowerCase(); });
  var tools = window.SharedTools || [];
  var activeTool = null;

  var $ = function (id) { return document.getElementById(id); };

  function show(name) {
    ['loading', 'login', 'denied', 'app'].forEach(function (s) {
      $('screen-' + s).hidden = (s !== name);
    });
  }

  /* ── auth ──────────────────────────────────────────────── */

  function showLogin() {
    show('login');
    window.SharedAuth.mount({
      sb: sb,
      root: $('auth-root'),
      onSuccess: function (session) { start(session); }
    });
  }

  function signOut() {
    sb.auth.signOut().then(function () { window.location.reload(); });
  }
  $('btn-signout').addEventListener('click', signOut);
  $('btn-signout-denied').addEventListener('click', signOut);

  /* ── account menu ──────────────────────────────────────── */

  $('btn-menu').addEventListener('click', function (e) {
    e.stopPropagation();
    $('menu').hidden = !$('menu').hidden;
  });
  document.addEventListener('click', function () { $('menu').hidden = true; });
  $('menu').addEventListener('click', function (e) { e.stopPropagation(); });

  /* ── tools ─────────────────────────────────────────────── */

  function openTool(tool) {
    if (activeTool && activeTool.destroy) activeTool.destroy();
    activeTool = tool;
    $('tool-title').textContent = tool.title;
    Array.prototype.forEach.call($('toolnav').children, function (b) {
      b.setAttribute('aria-current', String(b.dataset.tool === tool.id));
    });
    var root = $('tool-root');
    root.innerHTML = '';
    tool.mount(root, ctx);
    try { localStorage.setItem('shared:lastTool', tool.id); } catch (_) {}
  }

  function buildNav() {
    var nav = $('toolnav');
    nav.hidden = tools.length < 2;   // no point in one tab
    if (nav.hidden) return;
    tools.forEach(function (t) {
      var b = document.createElement('button');
      b.textContent = t.navLabel || t.title;
      b.dataset.tool = t.id;
      b.addEventListener('click', function () { openTool(t); });
      nav.appendChild(b);
    });
  }

  /* ── context handed to each tool ───────────────────────── */

  var ctx = {
    sb: sb,
    user: null,
    // "asittley@gmail.com" -> "Drew"
    shortName: function (email) {
      if (!email) return 'someone';
      var key = email.trim().toLowerCase();
      var named = (cfg.NAMES || {})[key];
      if (named) return named;
      var n = key.split('@')[0].replace(/[._\d]+/g, ' ').trim();
      return n.charAt(0).toUpperCase() + n.slice(1);
    },
    // Whose pen wrote this. The value goes into a style attribute, so only a
    // plain hex colour is let through — anything else falls back to house ink.
    pen: function (email) {
      var c = (cfg.PENS || {})[(email || '').trim().toLowerCase()];
      return /^#[0-9a-f]{3,8}$/i.test(c || '') ? c : 'var(--ink)';
    }
  };

  /* ── boot ──────────────────────────────────────────────── */

  function start(session) {
    // A recovery link hands us a live session, but they must set a password
    // before anything else — otherwise the next sign-in fails exactly as before.
    if (pendingRecovery) { pendingRecovery = false; showLogin(); return; }
    if (!session) { showLogin(); return; }

    var email = (session.user.email || '').toLowerCase();
    if (allowed.indexOf(email) === -1) {
      $('denied-email').textContent = session.user.email || '(unknown)';
      show('denied');
      return;
    }

    ctx.user = session.user;
    try { localStorage.setItem('shared:email', email); } catch (_) {}
    var meta = session.user.user_metadata || {};
    var av = $('btn-menu');
    if (meta.avatar_url) av.style.backgroundImage = 'url("' + meta.avatar_url + '")';
    else av.textContent = ctx.shortName(email).charAt(0);
    $('menu-email').textContent = session.user.email;

    buildNav();
    var last = null;
    try { last = localStorage.getItem('shared:lastTool'); } catch (_) {}
    var pick = tools.filter(function (t) { return t.id === last; })[0] || tools[0];
    show('app');
    if (pick) openTool(pick);
  }

  // Recovery link, or an expired-link error — either way, auth screens first.
  var pendingRecovery = !!window.SharedAuth.linkIntent;

  sb.auth.getSession().then(function (r) {
    start(r.data.session);
  });

  sb.auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_OUT') window.location.reload();
  });
})();
