/* Shared shopping list. Registers itself on window.SharedTools. */
(function () {
  'use strict';

  var TABLE = 'shared_shopping_items';

  window.SharedTools = window.SharedTools || [];
  window.SharedTools.push({
    id: 'shopping',
    title: 'Shopping',
    navLabel: '🛒 Shopping',
    mount: mount,
    destroy: destroy
  });

  var sb, ctx, root, items = [], channel = null, onVisible = null;

  function mount(el, context) {
    root = el;
    ctx = context;
    sb = context.sb;
    items = [];

    root.innerHTML =
      '<p class="banner" id="shop-error" hidden></p>' +
      '<form class="addbar" id="shop-add">' +
        '<input id="shop-input" placeholder="Add an item…" autocomplete="off"' +
          ' enterkeyhint="done" maxlength="200" aria-label="New item">' +
        '<button type="submit" aria-label="Add">+</button>' +
      '</form>' +
      '<div id="shop-body"></div>';

    document.getElementById('shop-add').addEventListener('submit', onAdd);
    root.addEventListener('click', onClick);

    load();
    subscribe();

    // Phones suspend tabs — refresh whenever the app comes back to the front.
    onVisible = function () { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
  }

  function destroy() {
    if (channel) { sb.removeChannel(channel); channel = null; }
    if (onVisible) { document.removeEventListener('visibilitychange', onVisible); onVisible = null; }
  }

  /* ── data ──────────────────────────────────────────────── */

  function fail(err) {
    var b = document.getElementById('shop-error');
    if (!b) return;
    b.textContent = err ? (err.message || String(err)) : '';
    b.hidden = !err;
  }

  function load() {
    return sb.from(TABLE).select('*').order('created_at', { ascending: true })
      .then(function (r) {
        if (r.error) return fail(r.error);
        fail(null);
        items = r.data || [];
        render();
      });
  }

  function subscribe() {
    channel = sb.channel('shared-shopping')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, function () { load(); })
      .subscribe();
  }

  function onAdd(e) {
    e.preventDefault();
    var input = document.getElementById('shop-input');
    var name = input.value.trim();
    if (!name) return;
    input.value = '';

    // Show it right away; the insert result (or realtime) replaces it.
    var temp = {
      id: 'temp-' + Math.random().toString(36).slice(2),
      name: name, bought: false, pending: true,
      created_by: ctx.user.email, created_at: new Date().toISOString()
    };
    items.push(temp);
    render();

    sb.from(TABLE).insert({ name: name }).select().single().then(function (r) {
      items = items.filter(function (i) { return i.id !== temp.id; });
      if (r.error) { fail(r.error); input.value = name; }
      else { fail(null); if (r.data) items.push(r.data); }
      render();
    });
  }

  function onClick(e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var id = btn.closest('.item') ? btn.closest('.item').dataset.id : null;
    var act = btn.dataset.act;

    if (act === 'toggle') return toggle(id);
    if (act === 'delete') return remove(id);
    if (act === 'clear') return clearBought();
  }

  function toggle(id) {
    var it = byId(id);
    if (!it || it.pending) return;
    var next = !it.bought;
    it.bought = next;            // optimistic
    it.pending = true;
    render();

    sb.from(TABLE).update({
      bought: next,
      bought_at: next ? new Date().toISOString() : null,
      bought_by: next ? ctx.user.email : null
    }).eq('id', id).then(function (r) {
      it.pending = false;
      if (r.error) { it.bought = !next; fail(r.error); } else fail(null);
      render();
    });
  }

  function remove(id) {
    var it = byId(id);
    if (!it) return;
    items = items.filter(function (i) { return i.id !== id; });
    render();
    sb.from(TABLE).delete().eq('id', id).then(function (r) {
      if (r.error) { fail(r.error); load(); }
    });
  }

  function clearBought() {
    var done = items.filter(function (i) { return i.bought && !i.pending; });
    if (!done.length) return;
    if (!confirm('Remove ' + done.length + ' bought item' + (done.length > 1 ? 's' : '') + '?')) return;
    var ids = done.map(function (i) { return i.id; });
    items = items.filter(function (i) { return ids.indexOf(i.id) === -1; });
    render();
    sb.from(TABLE).delete().in('id', ids).then(function (r) {
      if (r.error) { fail(r.error); load(); }
    });
  }

  function byId(id) {
    return items.filter(function (i) { return i.id === id; })[0];
  }

  /* ── view ──────────────────────────────────────────────── */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function row(it) {
    var who = it.bought
      ? 'Got by ' + ctx.shortName(it.bought_by)
      : 'Added by ' + ctx.shortName(it.created_by);
    return '<li class="item' + (it.bought ? ' done' : '') + (it.pending ? ' pending' : '') +
             '" data-id="' + esc(it.id) + '">' +
        '<button class="check" data-act="toggle" aria-label="Mark bought">✓</button>' +
        '<span class="item-body">' +
          '<span class="item-name">' + esc(it.name) + '</span>' +
          '<span class="item-meta">' + esc(who) + '</span>' +
        '</span>' +
        '<button class="del" data-act="delete" aria-label="Delete">✕</button>' +
      '</li>';
  }

  function render() {
    var body = document.getElementById('shop-body');
    if (!body) return;

    var todo = items.filter(function (i) { return !i.bought; });
    var done = items.filter(function (i) { return i.bought; });
    var html = '';

    if (!items.length) {
      html = '<div class="empty"><div class="logo">🧺</div>' +
             '<p>The list is empty.<br>Add the first thing above.</p></div>';
    } else {
      html += '<ul class="list">' + todo.map(row).join('') + '</ul>';
      if (!todo.length) html += '<p class="empty">All done — nothing left to grab. 🎉</p>';
      if (done.length) {
        html += '<div class="section-label"><span>Bought (' + done.length + ')</span>' +
                '<button data-act="clear">Clear</button></div>' +
                '<ul class="list">' + done.map(row).join('') + '</ul>';
      }
    }
    body.innerHTML = html;
  }
})();
