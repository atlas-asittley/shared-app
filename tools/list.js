/* A shared checklist. One table, many lists — each tool instance owns a
   `list` key ('shopping', 'camping', …), so a new list is one makeList()
   call at the bottom of this file plus nothing else. */
(function () {
  'use strict';

  var TABLE = 'shared_shopping_items';

  function makeList(spec) {
    var sb, ctx, root, items = [], channel = null, onVisible = null;

    function mount(el, context) {
      root = el;
      ctx = context;
      sb = context.sb;
      items = [];

      root.innerHTML =
        '<p class="banner" id="l-error" hidden></p>' +
        '<form class="addbar" id="l-add">' +
          '<input id="l-input" placeholder="' + spec.placeholder + '" autocomplete="off"' +
            ' enterkeyhint="done" maxlength="200" aria-label="New item">' +
          '<button type="submit" aria-label="Add">+</button>' +
        '</form>' +
        '<div id="l-body"></div>';

      document.getElementById('l-add').addEventListener('submit', onAdd);
      root.addEventListener('click', onClick);

      load();

      channel = sb.channel('list-' + spec.id)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: TABLE, filter: 'list=eq.' + spec.list
        }, function () { load(); })
        .subscribe();

      // Phones suspend tabs — refresh whenever the app comes back to the front.
      onVisible = function () { if (!document.hidden) load(); };
      document.addEventListener('visibilitychange', onVisible);
    }

    function destroy() {
      if (channel) { sb.removeChannel(channel); channel = null; }
      if (onVisible) { document.removeEventListener('visibilitychange', onVisible); onVisible = null; }
    }

    /* ── data ────────────────────────────────────────────── */

    function fail(err) {
      var b = document.getElementById('l-error');
      if (!b) return;
      b.textContent = err ? (err.message || String(err)) : '';
      b.hidden = !err;
    }

    function load() {
      return sb.from(TABLE).select('*').eq('list', spec.list)
        .order('created_at', { ascending: true })
        .then(function (r) {
          if (r.error) return fail(r.error);
          fail(null);
          items = r.data || [];
          render();
        });
    }

    function add(names) {
      var rows = names.map(function (n) { return { name: n, list: spec.list }; });
      return sb.from(TABLE).insert(rows).select().then(function (r) {
        if (r.error) { fail(r.error); return null; }
        fail(null);
        return r.data || [];
      });
    }

    function onAdd(e) {
      e.preventDefault();
      var input = document.getElementById('l-input');
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

      add([name]).then(function (rows) {
        items = items.filter(function (i) { return i.id !== temp.id; });
        if (!rows) input.value = name;
        else items = items.concat(rows);
        render();
      });
    }

    function onClick(e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var li = btn.closest('.item');
      var act = btn.dataset.act;

      if (act === 'toggle') return toggle(li.dataset.id);
      if (act === 'delete') return remove(li.dataset.id);
      if (act === 'clear') return clearDone();
      if (act === 'starter') return addStarter(btn);
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
      if (!byId(id)) return;
      items = items.filter(function (i) { return i.id !== id; });
      render();
      sb.from(TABLE).delete().eq('id', id).then(function (r) {
        if (r.error) { fail(r.error); load(); }
      });
    }

    function clearDone() {
      var done = items.filter(function (i) { return i.bought && !i.pending; });
      if (!done.length) return;
      if (!confirm('Remove ' + done.length + ' ' + spec.doneWord +
                   ' item' + (done.length > 1 ? 's' : '') + '?')) return;
      var ids = done.map(function (i) { return i.id; });
      items = items.filter(function (i) { return ids.indexOf(i.id) === -1; });
      render();
      sb.from(TABLE).delete().in('id', ids).then(function (r) {
        if (r.error) { fail(r.error); load(); }
      });
    }

    function addStarter(btn) {
      btn.disabled = true;
      btn.textContent = 'Adding…';
      // Skip anything already on the list, so this is safe to tap twice.
      var have = items.map(function (i) { return i.name.toLowerCase(); });
      var fresh = spec.starter.filter(function (n) { return have.indexOf(n.toLowerCase()) === -1; });
      if (!fresh.length) { load(); return; }
      add(fresh).then(function () { load(); });
    }

    function byId(id) {
      return items.filter(function (i) { return i.id === id; })[0];
    }

    /* ── view ────────────────────────────────────────────── */

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function row(it) {
      var who = it.bought
        ? spec.doneBy + ' ' + ctx.shortName(it.bought_by)
        : 'Added by ' + ctx.shortName(it.created_by);
      return '<li class="item' + (it.bought ? ' done' : '') + (it.pending ? ' pending' : '') +
               '" data-id="' + esc(it.id) + '">' +
          '<button class="check" data-act="toggle" aria-label="Mark ' + spec.doneWord + '">✓</button>' +
          '<span class="item-body">' +
            '<span class="item-name">' + esc(it.name) + '</span>' +
            '<span class="item-meta">' + esc(who) + '</span>' +
          '</span>' +
          '<button class="del" data-act="delete" aria-label="Delete">✕</button>' +
        '</li>';
    }

    function render() {
      var body = document.getElementById('l-body');
      if (!body) return;

      var todo = items.filter(function (i) { return !i.bought; });
      var done = items.filter(function (i) { return i.bought; });
      var html = '';

      if (!items.length) {
        html = '<div class="empty"><div class="logo">' + spec.emptyIcon + '</div>' +
               '<p>' + spec.emptyText + '</p></div>';
        if (spec.starter && spec.starter.length) {
          html += '<button class="btn btn-ghost" data-act="starter">' + spec.starterLabel + '</button>';
        }
      } else {
        html += '<ul class="list">' + todo.map(row).join('') + '</ul>';
        if (!todo.length) html += '<p class="empty">' + spec.allDoneText + '</p>';
        if (done.length) {
          html += '<div class="section-label"><span>' + spec.doneLabel + ' (' + done.length + ')</span>' +
                  '<button data-act="clear">Clear</button></div>' +
                  '<ul class="list">' + done.map(row).join('') + '</ul>';
        }
      }
      body.innerHTML = html;
    }

    return {
      id: spec.id, title: spec.title, navLabel: spec.navLabel,
      mount: mount, destroy: destroy
    };
  }

  /* ── the lists ─────────────────────────────────────────── */

  window.SharedTools = window.SharedTools || [];

  window.SharedTools.push(makeList({
    id: 'shopping', list: 'shopping',
    title: 'Shopping', navLabel: '🛒 Shopping',
    placeholder: 'Add an item…',
    emptyIcon: '🧺', emptyText: 'The list is empty.<br>Add the first thing above.',
    allDoneText: 'All done — nothing left to grab. 🎉',
    doneLabel: 'Bought', doneWord: 'bought', doneBy: 'Got by',
    starter: null
  }));

  window.SharedTools.push(makeList({
    id: 'camping', list: 'camping',
    title: 'Camping', navLabel: '⛺ Camping',
    placeholder: 'Add something to pack or buy…',
    emptyIcon: '⛺',
    emptyText: 'Nothing on the camping list yet.<br>Add things above, or start from the basics.',
    allDoneText: 'Everything\'s packed. Have fun. 🔥',
    doneLabel: 'Sorted', doneWord: 'packed', doneBy: 'Sorted by',
    starterLabel: 'Add the camping basics',
    starter: [
      'Tent', 'Stakes + mallet', 'Sleeping bags', 'Sleeping pads', 'Pillows',
      'Camp chairs', 'Headlamps', 'Batteries', 'Lighter / matches', 'Firewood',
      'Cooler', 'Ice', 'Water jug', 'Camp stove + fuel', 'Cookware + utensils',
      'Plates, cups, cutlery', 'Trash bags', 'Paper towels', 'Dish soap + sponge',
      'Bug spray', 'Sunscreen', 'First aid kit', 'Toilet paper', 'Towels',
      'Warm layers', 'Rain jackets', 'Battery pack + chargers', 'Coffee setup',
      "S'mores stuff"
    ]
  }));
})();
