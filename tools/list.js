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

      // Serial number and printer's mark, stable per list — same trick as a
      // real pad, where every check in the book has its own number.
      var h = 0;
      for (var i = 0; i < spec.list.length; i++) h = (h * 31 + spec.list.charCodeAt(i)) >>> 0;
      var num = String(100000 + h % 900000);
      var d = new Date();

      root.innerHTML =
        '<p class="banner" id="l-error" hidden></p>' +
        '<div class="gcheck">' +
          '<div class="gc-top">' +
            '<div class="gc-brand"><span class="gc-title">Guest Check</span>' +
              '<span class="gc-num">' + num + '</span></div>' +
            '<table class="gc-info" aria-hidden="true">' +
              '<tr><th>Date</th><th>Table</th><th>Guests</th><th>Server</th></tr>' +
              '<tr><td>' + (d.getMonth() + 1) + '/' + d.getDate() + '</td>' +
                '<td>17</td><td>2</td>' +
                '<td>' + esc(ctx.shortName(ctx.user.email)) + '</td></tr>' +
            '</table>' +
            '<div class="gc-strip" aria-hidden="true">APPT - SOUP/SAL - ENTREE - VEG/POT - DESSERT - BEV</div>' +
          '</div>' +
          '<div class="gc-pad">' +
            // The add form is the top line of the pad. It lives outside render()
            // so a realtime refresh never rebuilds it mid-typing.
            '<form class="gc-add" id="l-add">' +
              '<button type="submit" aria-label="Add">+</button>' +
              '<input id="l-input" placeholder="' + spec.placeholder + '" autocomplete="off"' +
                ' enterkeyhint="done" maxlength="200" aria-label="New item">' +
            '</form>' +
            '<div id="l-body"></div>' +
            '<div class="gc-code" aria-hidden="true">G' + String(1000 + h % 9000) + '</div>' +
          '</div>' +
        '</div>';

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
      return '<div class="item' + (it.bought ? ' done' : '') + (it.pending ? ' pending' : '') +
               '" data-id="' + esc(it.id) + '">' +
          '<button class="check" data-act="toggle" aria-label="Mark ' + spec.doneWord + '">✓</button>' +
          '<span class="item-body">' +
            '<span class="item-name">' + esc(it.name) + '</span>' +
            '<span class="item-meta">' + esc(who) + '</span>' +
          '</span>' +
          '<button class="del" data-act="delete" aria-label="Delete">✕</button>' +
        '</div>';
    }

    function render() {
      var body = document.getElementById('l-body');
      if (!body) return;

      var todo = items.filter(function (i) { return !i.bought; });
      var done = items.filter(function (i) { return i.bought; });
      var html = '';
      var lines = 0;   // rows drawn, so filler can pad the check out

      html += todo.map(row).join('');
      lines += todo.length;

      if (!items.length) {
        html += '<div class="gc-msg">' + spec.emptyText + '</div>';
        lines += 2;
        if (spec.starter && spec.starter.length) {
          html += '<button class="gc-starter" data-act="starter">+ ' + spec.starterLabel + '</button>';
          lines += 1;
        }
      } else if (!todo.length) {
        html += '<div class="gc-msg">' + spec.allDoneText + '</div>';
        lines += 2;
      }

      if (done.length) {
        html += '<div class="gc-sec"><span>' + spec.doneLabel + ' (' + done.length + ')</span>' +
                '<button data-act="clear">Clear</button></div>' +
                done.map(row).join('');
        lines += 1 + done.length;
      }

      // A real check is a fixed pad, not a list that grows from nothing —
      // blank ruled lines keep the shape when there's little written on it.
      for (; lines < 8; lines++) html += '<div class="gc-fill"></div>';

      html += '<div class="gc-sum"><span>Tax</span></div>' +
              '<div class="gc-sum gc-grand"><span>Total</span>' +
                '<span class="gc-count">' + todo.length + ' left</span></div>';

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
    placeholder: 'Add to the order…',
    emptyText: 'No order yet.<br>Add the first thing above.',
    allDoneText: 'Order up! <span class="ding">🔔</span><br>Nothing left to grab.',
    doneLabel: 'Bought', doneWord: 'bought', doneBy: 'Got by',
    starter: null
  }));

  window.SharedTools.push(makeList({
    id: 'camping', list: 'camping',
    title: 'Camping', navLabel: '⛺ Camping',
    placeholder: 'Add something to pack or buy…',
    emptyText: 'Nothing on the camping list yet.<br>Add things above, or start from the basics.',
    allDoneText: 'Order up! <span class="ding">🔔</span><br>Everything is packed.',
    doneLabel: 'Packed', doneWord: 'packed', doneBy: 'Packed by',
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
