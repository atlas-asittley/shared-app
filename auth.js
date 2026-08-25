/* Auth screens: sign in · create account · forgot password · set new password.
   Mirrors ~/citybuilder-game/src/ui/AuthScreen.js, minus the build step.

   IMPORTANT: the recovery fragment is snapshotted here, at load time, because
   supabase-js (detectSessionInUrl) consumes and clears it the moment the client
   is constructed in app.js — which loads after this file. */
(function () {
  'use strict';

  /* ── recovery-link fragment ────────────────────────────── */

  function parseAuthHash(hash) {
    var raw = String(hash || '').replace(/^#/, '');
    if (!raw) return null;
    var p;
    try { p = new URLSearchParams(raw); } catch (_) { return null; }

    if (p.get('error')) {
      return {
        kind: 'error',
        code: p.get('error_code') || p.get('error') || 'unknown',
        message: (p.get('error_description') || '').replace(/\+/g, ' ')
      };
    }
    if (p.get('type') === 'recovery') return { kind: 'recovery' };
    return null;
  }

  function describeAuthError(err) {
    if (!err) return '';
    if (err.code === 'otp_expired') {
      return 'That reset link has expired. Reset links are single-use and time-limited — request a new one below.';
    }
    if (err.code === 'access_denied') {
      return 'That reset link is no longer valid. Request a new one below.';
    }
    return err.message || 'That link could not be used. Request a new one below.';
  }

  var linkIntent = parseAuthHash(window.location.hash);

  /* ── screens ───────────────────────────────────────────── */

  var sb, root, onSuccess;

  function $(id) { return document.getElementById(id); }

  function recoveryRedirectUrl() {
    return window.location.origin + window.location.pathname;
  }

  function lastEmail() {
    try { return localStorage.getItem('shared:email') || ''; } catch (_) { return ''; }
  }

  function busy(btn, on, label) {
    btn.disabled = on;
    btn.textContent = on ? label : btn.dataset.label;
  }

  function head(title, sub) {
    return '<div class="check-head" aria-hidden="true">' +
        '<span>Guest Check</span><span>Table 17</span><span>No. 0417</span>' +
      '</div>' +
      '<div class="center">' +
      '<div class="hat hat-lg" aria-hidden="true"></div>' +
      '<h1>' + title + '</h1>' +
      '<p class="muted">' + sub + '</p>' +
      '</div>';
  }

  function field(id, type, label, ph, ac, extra) {
    return '<label class="field"><span>' + label + '</span>' +
      '<input id="' + id + '" type="' + type + '" placeholder="' + ph + '"' +
      ' autocomplete="' + ac + '" required ' + (extra || '') + '></label>';
  }

  /* Sign in */
  function mountLogin(prefill) {
    root.innerHTML =
      head('Drew &amp; Jill', 'Booth 17. Same login as the city builder.') +
      '<form class="loginform" id="f-login">' +
        field('in-email', 'email', 'Email', 'you@gmail.com', 'username', 'enterkeyhint="next"') +
        field('in-pass', 'password', 'Password', '••••••••', 'current-password', 'enterkeyhint="go"') +
        '<button type="submit" class="btn btn-primary" id="b-login" data-label="Sign in">Sign in</button>' +
      '</form>' +
      '<p class="error" id="e-login" hidden></p>' +
      '<div class="links">' +
        '<button class="linkbtn" id="to-forgot">Forgot password?</button>' +
        '<button class="linkbtn" id="to-register">Create an account</button>' +
      '</div>';

    $('in-email').value = prefill != null ? prefill : lastEmail();

    $('f-login').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('in-email').value.trim().toLowerCase();
      var pass = $('in-pass').value;
      var btn = $('b-login'), err = $('e-login');
      err.hidden = true;
      busy(btn, true, 'Signing in…');

      sb.auth.signInWithPassword({ email: email, password: pass }).then(function (r) {
        if (r.error) {
          err.textContent = /invalid login/i.test(r.error.message)
            ? 'Wrong email or password.' : r.error.message;
          err.hidden = false;
          busy(btn, false);
          return;
        }
        if (!r.data.session) {
          err.textContent = 'Check your email to confirm your account, then sign in.';
          err.hidden = false;
          busy(btn, false);
          return;
        }
        onSuccess(r.data.session);
      });
    });

    $('to-register').addEventListener('click', function () {
      mountRegister($('in-email').value.trim());
    });
    $('to-forgot').addEventListener('click', function () {
      mountForgot($('in-email').value.trim());
    });
  }

  /* Create account */
  function mountRegister(prefill) {
    root.innerHTML =
      head('Create Account', 'Pick a password you&rsquo;ll remember.') +
      '<form class="loginform" id="f-reg">' +
        field('r-email', 'email', 'Email', 'you@gmail.com', 'email', '') +
        field('r-pass', 'password', 'Password', 'at least 6 characters', 'new-password', 'minlength="6"') +
        field('r-conf', 'password', 'Confirm password', '••••••••', 'new-password', '') +
        '<button type="submit" class="btn btn-primary" id="b-reg" data-label="Create account">Create account</button>' +
      '</form>' +
      '<p class="error" id="e-reg" hidden></p>' +
      '<div class="links"><button class="linkbtn" id="to-login">Already have an account? Sign in</button></div>';

    $('r-email').value = prefill || '';

    $('f-reg').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('r-email').value.trim().toLowerCase();
      var pass = $('r-pass').value;
      var btn = $('b-reg'), err = $('e-reg');
      err.hidden = true;

      if (pass !== $('r-conf').value) {
        err.textContent = 'Passwords do not match.';
        err.hidden = false;
        return;
      }
      busy(btn, true, 'Creating…');

      sb.auth.signUp({ email: email, password: pass }).then(function (r) {
        if (r.error) {
          err.textContent = r.error.message;
          err.hidden = false;
          busy(btn, false);
          return;
        }
        if (!r.data.session) {
          err.textContent = 'Check your email to confirm your account, then sign in.';
          err.hidden = false;
          busy(btn, false);
          return;
        }
        onSuccess(r.data.session);
      });
    });

    $('to-login').addEventListener('click', function () { mountLogin($('r-email').value.trim()); });
  }

  /* Forgot password */
  function mountForgot(prefill) {
    root.innerHTML =
      head('Reset Password', 'We&rsquo;ll email you a link to set a new one.') +
      '<form class="loginform" id="f-forgot">' +
        field('g-email', 'email', 'Email', 'you@gmail.com', 'email', '') +
        '<button type="submit" class="btn btn-primary" id="b-forgot" data-label="Send reset link">Send reset link</button>' +
      '</form>' +
      '<p class="error" id="e-forgot" hidden></p>' +
      '<div class="links"><button class="linkbtn" id="to-login">Back to sign in</button></div>';

    $('g-email').value = prefill || lastEmail();

    $('f-forgot').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('g-email').value.trim().toLowerCase();
      var btn = $('b-forgot'), err = $('e-forgot');
      err.hidden = true;
      busy(btn, true, 'Sending…');

      sb.auth.resetPasswordForEmail(email, { redirectTo: recoveryRedirectUrl() })
        .then(function (r) {
          if (r.error) {
            err.textContent = r.error.message || 'Could not send the reset email.';
            err.hidden = false;
            busy(btn, false);
            return;
          }
          // Never distinguish "sent" from "no such account" — that difference
          // would let anyone probe which addresses are registered.
          root.innerHTML =
            head('Check Your Email', 'If an account exists for <strong id="sent-to"></strong>, ' +
                 'a reset link is on its way. It expires in an hour and works once.') +
            '<p class="muted center hint">Nothing arrived? Check spam, then try again in a few ' +
            'minutes — reset emails are rate-limited.</p>' +
            '<div class="links"><button class="linkbtn" id="to-login">Back to sign in</button></div>';
          // textContent, not interpolation — the address is user input.
          $('sent-to').textContent = email;
          $('to-login').addEventListener('click', function () { mountLogin(email); });
        });
    });

    $('to-login').addEventListener('click', function () { mountLogin($('g-email').value.trim()); });
  }

  /* Set a new password — reached only from a recovery link. */
  function mountReset(err) {
    if (err) {
      root.innerHTML =
        head('Link Expired', '<span id="link-err"></span>') +
        '<div class="links">' +
          '<button class="linkbtn" id="to-forgot">Send a new link</button>' +
          '<button class="linkbtn" id="to-login">Back to sign in</button>' +
        '</div>';
      $('link-err').textContent = describeAuthError(err);
      $('to-forgot').addEventListener('click', function () { mountForgot(''); });
      $('to-login').addEventListener('click', function () { mountLogin(); });
      return;
    }

    root.innerHTML =
      head('Set a New Password', 'Almost there.') +
      '<form class="loginform" id="f-reset">' +
        field('n-pass', 'password', 'New password', 'at least 6 characters', 'new-password', 'minlength="6"') +
        field('n-conf', 'password', 'Confirm password', '••••••••', 'new-password', '') +
        '<button type="submit" class="btn btn-primary" id="b-reset" data-label="Save password">Save password</button>' +
      '</form>' +
      '<p class="error" id="e-reset" hidden></p>';

    $('f-reset').addEventListener('submit', function (e) {
      e.preventDefault();
      var pass = $('n-pass').value;
      var btn = $('b-reset'), er = $('e-reset');
      er.hidden = true;

      if (pass !== $('n-conf').value) {
        er.textContent = 'Passwords do not match.';
        er.hidden = false;
        return;
      }
      busy(btn, true, 'Saving…');

      sb.auth.updateUser({ password: pass }).then(function (r) {
        if (r.error) {
          er.textContent = r.error.message || 'Could not update your password.';
          er.hidden = false;
          busy(btn, false);
          return;
        }
        sb.auth.getSession().then(function (s) {
          var session = s.data.session;
          if (!session) {
            er.textContent = 'Your reset link expired. Request a new one from the sign-in screen.';
            er.hidden = false;
            busy(btn, false);
            return;
          }
          history.replaceState(null, '', window.location.pathname);
          onSuccess(session);
        });
      });
    });
  }

  /* ── public surface ────────────────────────────────────── */

  window.SharedAuth = {
    linkIntent: linkIntent,
    mount: function (opts) {
      sb = opts.sb;
      root = opts.root;
      onSuccess = opts.onSuccess;
      if (linkIntent && linkIntent.kind === 'recovery') return mountReset(null);
      if (linkIntent && linkIntent.kind === 'error') return mountReset(linkIntent);
      mountLogin();
    },
    signIn: function () { mountLogin(); }
  };
})();
