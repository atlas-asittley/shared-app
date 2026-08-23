/* Notes to Claude. Drew or Jill write something; a daily job reads the
   'new' rows and writes back a reply, which shows up here. */
(function () {
  'use strict';

  var TABLE = 'shared_feedback';

  window.SharedTools = window.SharedTools || [];
  window.SharedTools.push({
    id: 'feedback',
    title: 'Notes',
    navLabel: '💬 Notes',
    mount: mount,
    destroy: destroy
  });

  var sb, ctx, root, notes = [], channel = null, onVisible = null;

  function mount(el, context) {
    root = el;
    ctx = context;
    sb = context.sb;
    notes = [];

    root.innerHTML =
      '<p class="banner" id="fb-error" hidden></p>' +
      '<form id="fb-add" class="composer">' +
        '<textarea id="fb-text" rows="3" maxlength="2000"' +
          ' placeholder="Something broken? Want a new feature? Tell Claude here."' +
          ' aria-label="Note to Claude"></textarea>' +
        '<button type="submit" class="btn btn-primary" id="fb-send" data-label="Send">Send</button>' +
      '</form>' +
      '<p class="muted hint">Checked once a day. You&rsquo;ll see a reply on the note itself.</p>' +
      '<div id="fb-body"></div>';

    document.getElementById('fb-add').addEventListener('submit', onSend);
    root.addEventListener('click', onClick);

    load();
    channel = sb.channel('shared-feedback')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, function () { load(); })
      .subscribe();

    onVisible = function () { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
  }

  function destroy() {
    if (channel) { sb.removeChannel(channel); channel = null; }
    if (onVisible) { document.removeEventListener('visibilitychange', onVisible); onVisible = null; }
  }

  /* ── data ──────────────────────────────────────────────── */

  function fail(err) {
    var b = document.getElementById('fb-error');
    if (!b) return;
    b.textContent = err ? (err.message || String(err)) : '';
    b.hidden = !err;
  }

  function load() {
    return sb.from(TABLE).select('*').order('created_at', { ascending: false })
      .then(function (r) {
        if (r.error) return fail(r.error);
        fail(null);
        notes = r.data || [];
        render();
      });
  }

  function onSend(e) {
    e.preventDefault();
    var ta = document.getElementById('fb-text');
    var body = ta.value.trim();
    if (!body) return;

    var btn = document.getElementById('fb-send');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    sb.from(TABLE).insert({ body: body }).select().single().then(function (r) {
      btn.disabled = false;
      btn.textContent = btn.dataset.label;
      if (r.error) return fail(r.error);
      fail(null);
      ta.value = '';
      if (r.data) notes.unshift(r.data);
      render();
    });
  }

  function onClick(e) {
    var btn = e.target.closest('button[data-act="delete"]');
    if (!btn) return;
    var id = btn.closest('.note').dataset.id;
    notes = notes.filter(function (n) { return n.id !== id; });
    render();
    sb.from(TABLE).delete().eq('id', id).then(function (r) {
      if (r.error) { fail(r.error); load(); }
    });
  }

  /* ── view ──────────────────────────────────────────────── */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return days + ' days ago';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  var STATUS = { new: 'Waiting', seen: 'Looking at it', done: 'Done' };

  function note(n) {
    return '<div class="note status-' + esc(n.status) + '" data-id="' + esc(n.id) + '">' +
      '<div class="note-head">' +
        '<span class="pill">' + esc(STATUS[n.status] || n.status) + '</span>' +
        '<span class="item-meta">' + esc(ctx.shortName(n.created_by)) + ' · ' + esc(when(n.created_at)) + '</span>' +
        '<button class="del" data-act="delete" aria-label="Delete note">✕</button>' +
      '</div>' +
      '<p class="note-body">' + esc(n.body) + '</p>' +
      (n.reply
        ? '<div class="note-reply"><strong>Claude:</strong> ' + esc(n.reply) + '</div>'
        : '') +
    '</div>';
  }

  function render() {
    var body = document.getElementById('fb-body');
    if (!body) return;
    body.innerHTML = notes.length
      ? '<div class="section-label"><span>Your notes</span></div>' + notes.map(note).join('')
      : '';
  }
})();
