/* Painting Recall Benchmark: the galleries, the enlarged view and the ranking game.
   Plain JavaScript, no dependencies. It reads data.json and config.json, both beside this file. */
(function () {
  'use strict';

  var LS_ID = 'paintbench.browser-id';
  var LS_RANKINGS = 'paintbench.rankings';
  var LS_SEEN = 'paintbench.seen';
  var KEPT = 300; // rankings kept in this browser; the oldest go first

  var D = null; // data.json
  var CONFIG = { endpoint: '' };
  var cells = new Map(); // "painting|width|model" -> its attempts, by n
  var byId = new Map(); // attempt id -> attempt
  var sets = new Map(); // "painting|width" -> set
  var standing = new Map(); // attempt id -> {rank, of} in the judges' order of its set
  var models = new Map();
  var paintings = new Map();

  function $(id) { return document.getElementById(id); }

  /* h('div', {class: 'x', text: 'y'}, child, ...): an element. A null or false property or child is left out. */
  function h(tag, props) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      var value = props[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'style') node.style.cssText = value;
      else node.setAttribute(key, value === true ? '' : value);
    });
    for (var i = 2; i < arguments.length; i++) {
      [].concat(arguments[i]).forEach(function (kid) {
        if (kid !== null && kid !== undefined && kid !== false) node.append(kid);
      });
    }
    return node;
  }

  function idOf(a) { return a.p + '/' + a.w + '/' + a.m + '/' + a.n; }
  function ordinal(n) {
    var tens = n % 100, ones = n % 10;
    if (tens >= 11 && tens <= 13) return n + 'th';
    return n + (ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th');
  }
  function placed(place) { return (place.tied ? 'joint ' : '') + ordinal(place.rank); }
  function duration(seconds) {
    if (seconds === null || seconds === undefined) return '';
    var minutes = Math.round(seconds / 60);
    if (minutes < 1) return 'under a minute';
    if (minutes < 60) return minutes + ' min';
    return Math.floor(minutes / 60) + ' h ' + (minutes % 60) + ' min';
  }
  function reducedMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  function getJSON(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (response) {
      if (!response.ok) throw new Error(url + ': ' + response.status);
      return response.json();
    });
  }

  function start() {
    var version = document.body.getAttribute('data-version') || '';
    Promise.all([
      getJSON('data.json?v=' + encodeURIComponent(version)),
      getJSON('config.json').catch(function () { return {}; })
    ]).then(function (loaded) {
      D = loaded[0];
      if (loaded[1] && typeof loaded[1].endpoint === 'string') CONFIG.endpoint = loaded[1].endpoint.trim();
      index();
      watchExamples();
      initSizes();
      initLightbox();
      initGalleries();
      initLarger();
      initGame();
      retryUnsent();
      loadPack();
    }).catch(function (error) {
      var notice = $('load-error');
      if (notice) notice.hidden = false;
      if (window.console) console.error(error);
    });
  }

  /* The pictures in one file. Each is tiny, and fetched one by one they come in slowly, most of all in the galleries.
     With the pack in hand a picture is drawn without a request of its own. Until it arrives, and if it never does,
     pictures load from their own files. A browser that asks to save data is not sent the pack. */
  function loadPack() {
    if (navigator.connection && navigator.connection.saveData) return;
    getJSON('pictures.json?v=' + encodeURIComponent(D.data_version)).then(function (pack) {
      var inline = function (src) { return typeof pack[src] === 'string' ? 'data:image/png;base64,' + pack[src] : null; };
      byId.forEach(function (a) { if (a.src) a.src = inline(a.src) || a.src; });
      [].forEach.call(document.querySelectorAll('img.px'), function (img) { // those on the page already and still to come in
        var body = inline(img.getAttribute('src'));
        if (!body || (img.complete && img.naturalWidth)) return;
        img.src = body; // first, so that dropping `loading` starts no request for the file
        img.removeAttribute('loading');
      });
    }).catch(function () { /* the pictures load from their files */ });
  }
  /* A picture that came with the pack is in hand: there is nothing to put off until it is near the screen. */
  function inPack(src) { return /^data:/.test(src || ''); }

  function index() {
    D.models.forEach(function (m) { models.set(m.id, m); });
    D.paintings.forEach(function (p) { paintings.set(p.id, p); });
    D.attempts.forEach(function (a) {
      var key = a.p + '|' + a.w + '|' + a.m;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(a);
      byId.set(idOf(a), a);
    });
    (D.apart || []).forEach(function (m) { // an entry kept apart: its own gallery, and no part of the others or of the game
      models.set(m.id, m);
      m.attempts.forEach(function (a) {
        var key = a.p + '|' + a.w + '|' + a.m;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(a);
        byId.set(idOf(a), a);
      });
    });
    if (D.larger) { // pictures at a size above the run's largest: they can be enlarged, and are no part of the galleries or the game
      D.larger.models.forEach(function (m) { if (!models.has(m.id)) models.set(m.id, m); });
      D.larger.attempts.forEach(function (a) {
        if (byId.has(idOf(a))) return; // the run's own picture, named again
        var key = a.p + '|' + a.w + '|' + a.m;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(a);
        byId.set(idOf(a), a);
      });
    }
    cells.forEach(function (list) { list.sort(function (x, y) { return x.n - y.n; }); });
    D.sets.forEach(function (s) {
      sets.set(s.p + '|' + s.w, s);
      s.order.forEach(function (entry, i) {
        // Two pictures with the same mean rank are level for the judges: they share the better place.
        var rank = i + 1, tied = false;
        if (entry.r !== null) {
          rank = 1 + s.order.filter(function (o) { return o.r !== null && o.r < entry.r; }).length;
          tied = s.order.some(function (o) { return o !== entry && o.r === entry.r; });
        }
        standing.set(entry.a, { rank: rank, of: s.order.length, tied: tied, r: entry.r });
      });
    });
  }

  function heightAt(p, w) {
    var s = sets.get(p + '|' + w);
    return s && s.h ? s.h : null;
  }

  function stateOf(a) {
    var state = D.states[a ? a.state : 'not_run'] || D.states.missing;
    return { label: state.label, detail: (a && a.why) || state.detail };
  }

  /* The box that stands where a picture would be. `a` may be undefined: no such attempt in the run. */
  function noPicture(a, p, w, withDetail) {
    var state = stateOf(a);
    var height = (a && a.h) || heightAt(p, w);
    return h('span', { class: 'nopic', style: 'aspect-ratio:' + (height ? w + ' / ' + height : '4 / 3'), title: withDetail ? null : state.detail },
      h('b', { text: 'No picture' }), h('small', { text: withDetail ? state.label + '. ' + state.detail : state.label }));
  }

  function pictureImg(a, alt, eager) {
    return h('img', { class: 'px', src: a.src, width: a.w, height: a.h, alt: alt, loading: eager || inPack(a.src) ? null : 'lazy', decoding: 'async', draggable: 'false' });
  }

  function altFor(a) {
    return models.get(a.m).label + ': ' + paintings.get(a.p).name + ', ' + a.w + ' by ' + a.h + ' cells';
  }

  function refImg(p, eager) {
    return h('img', {
      src: p.ref.src, srcset: p.ref.thumb + ' 420w, ' + p.ref.src + ' ' + Math.max(p.ref.w, p.ref.h) + 'w',
      sizes: '(min-width: 900px) 40vw, 92vw', width: p.ref.w, height: p.ref.h,
      alt: p.name + ', the original', loading: eager ? null : 'lazy', decoding: 'async'
    });
  }

  function creditNode(p) {
    var credit = h('span', { class: 'credit' }, p.credit ? p.credit + (p.source_url ? ' · ' : '') : '');
    if (p.source_url) credit.append(h('a', { href: p.source_url, rel: 'noopener noreferrer', text: 'Source', 'aria-label': 'Source of the image of ' + p.name }));
    if (p.source_url && p.licence_url) credit.append(' · ');
    if (p.licence_url) credit.append(h('a', { href: p.licence_url, rel: 'noopener noreferrer', text: 'Licence', 'aria-label': 'Licence of the image of ' + p.name }));
    return credit;
  }

  function refFigure(p, cls) {
    if (!p.ref) {
      return h('figure', { class: cls },
        h('div', { class: 'withheld' }, 'The original is not reproduced on this page. ',
          p.source_url ? h('a', { href: p.source_url, rel: 'noopener noreferrer', text: 'See it at its source.' }) : null));
    }
    return h('figure', { class: cls }, refImg(p),
      h('figcaption', {}, h('b', { text: 'The original. ' }), [p.name, p.artist, p.date].filter(Boolean).join(', ') + '.', creditNode(p)));
  }

  /* ------------------------------------------------------------ what this browser has seen with the makers' names

     The ranking game hides the names, but the rest of the page shows them: an opened gallery, the enlarged view, the
     examples near the top, the reveal after a ranking. A saved ranking says whether the pictures of its painting had
     been shown that way in this browser before, so that whoever reads the rankings can set those aside. */

  var seenNow = null; // {painting id: true}, for this run

  function seen() {
    if (seenNow) return seenNow;
    seenNow = {};
    try {
      var kept = JSON.parse(localStorage.getItem(LS_SEEN) || 'null');
      if (kept && kept.run === D.run.id && kept.paintings && typeof kept.paintings === 'object') seenNow = kept.paintings;
    } catch (error) { /* no storage: what is seen is remembered for this visit only */ }
    return seenNow;
  }

  function markSeen(ids) {
    var known = seen(), changed = false;
    ids.forEach(function (id) {
      if (id && !known[id]) { known[id] = true; changed = true; }
    });
    if (!changed) return;
    try { localStorage.setItem(LS_SEEN, JSON.stringify({ run: D.run.id, paintings: known })); } catch (error) { /* kept for this visit */ }
  }

  /* The painting of the illustration at the top and of the examples in "How it works". */
  function heroPainting() {
    var pair = $('hero-pair');
    return pair ? pair.getAttribute('data-painting') || '' : '';
  }

  /* The examples in "How it works" show one painting's pictures under a model's name. Once any of them has been on screen, that painting counts as seen. */
  function watchExamples() {
    var painting = heroPainting();
    var examples = document.querySelectorAll('.demo-tool, .demo-sizes, .demo-judge');
    if (!painting || !examples.length) return;
    if (!('IntersectionObserver' in window)) { markSeen([painting]); return; }
    var watcher = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) {
        markSeen([painting]);
        watcher.disconnect();
      }
    });
    [].forEach.call(examples, function (node) { watcher.observe(node); });
  }

  /* ------------------------------------------------------------ the standings, one size at a time

     Every size's table is in the page; this shows the one that is chosen. The page always opens on the largest
     size: a choice is not remembered. An address that names a size (#size-64) still opens on it, so a size can be
     linked to. */

  function initSizes() {
    var control = $('size-control');
    if (!control) return;
    var tabs = [].slice.call(control.querySelectorAll('[role="tab"]'));
    var sizes = tabs.map(function (tab) { return tab.getAttribute('data-size'); });
    function show(size, keep) {
      if (sizes.indexOf(size) < 0) return false;
      tabs.forEach(function (tab) {
        var on = tab.getAttribute('data-size') === size;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        $(tab.getAttribute('aria-controls')).hidden = !on;
      });
      return true;
    }
    function fromAddress() {
      var named = /^#size-(\d+)$/.exec(location.hash);
      return named ? named[1] : null;
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { show(tab.getAttribute('data-size'), true); });
      tab.addEventListener('keydown', function (event) {
        var to = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? i + 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? i - 1
          : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (to === null) return;
        var next = tabs[(to + tabs.length) % tabs.length];
        show(next.getAttribute('data-size'), true);
        next.focus();
        event.preventDefault();
      });
    });
    window.addEventListener('hashchange', function () { show(fromAddress(), false); });
    try { sessionStorage.removeItem('paintbench.size'); } catch (error) { /* no storage */ }  // a choice an earlier page kept
    control.hidden = false;
    show(fromAddress(), false);
  }

  /* ------------------------------------------------------------ the galleries */

  function cell(p, w, m, axis) {
    var list = cells.get(p + '|' + w + '|' + m) || [];
    var a = list[0];
    var height = (a && a.h) || heightAt(p, w);
    var label = models.get(m).label + ', ' + paintings.get(p).name + ', ' + w + ' cells wide';
    var button = h('button', { type: 'button', class: 'pic', 'data-p': p, 'data-w': w, 'data-m': m, 'data-n': a ? a.n : '', 'data-axis': axis,
      'aria-label': a && a.src ? 'Enlarge: ' + label : label + ': no picture, ' + stateOf(a).label },
      a && a.src ? pictureImg(a, '') : noPicture(a, p, w));
    var caption = w + ' × ' + (height || '?') + (list.length > 1 ? ' · ' + list.length + ' attempts' : '');
    return h('figure', { class: 'cell' }, button, h('figcaption', { text: caption }));
  }

  function topPictures(setKey, count) {
    var s = sets.get(setKey);
    if (!s) return [];
    var ids = s.order.length ? s.order.map(function (o) { return o.a; }) : s.pictures;
    return ids.slice(0, count).map(function (id) { return byId.get(id); });
  }

  function strip(children) {
    return h('span', { class: 'strip', 'aria-hidden': 'true' }, children);
  }

  function stripImg(src, w, hgt, cls, title) {
    return h('img', { class: cls, src: src, width: w, height: hgt, alt: '', title: title, loading: inPack(src) ? null : 'lazy', decoding: 'async' });
  }
  /* A small copy of the real painting, with its credit to hand wherever it is shown. */
  function refThumb(p, cls) {
    return stripImg(p.ref.thumb, p.ref.w, p.ref.h, cls, p.name + (p.credit ? '. ' + p.credit : ''));
  }

  /* `shows` lists the paintings whose pictures the opened gallery shows with their makers' names. */
  function gallery(id, head, teaser, fill, shows) {
    var body = h('div', { class: 'gal-body' });
    var details = h('details', { class: 'gal', id: id },
      h('summary', {}, h('span', { class: 'gal-head' }, head), h('span', { class: 'chev', 'aria-hidden': 'true' }), teaser), body);
    details.addEventListener('toggle', function () {
      if (!details.open) return;
      markSeen(shows);
      if (!body.firstChild) fill(body);
    });
    return details;
  }

  function paintingGallery(p) {
    var largest = D.widths.slice().reverse().find(function (w) { var s = sets.get(p.id + '|' + w); return s && s.pictures.length; });
    var teaser = [];
    if (p.ref) teaser.push(refThumb(p, 'real'));
    D.widths.slice().reverse().forEach(function (w) {  // the largest size first, then the smaller ones, until the row is full
      if (w > largest || teaser.length >= 20) return;
      topPictures(p.id + '|' + w, 20 - teaser.length).forEach(function (a) { if (a && a.src) teaser.push(stripImg(a.src, a.w, a.h, 'px')); });
    });
    return gallery('painting-' + p.id,
      [h('span', { class: 'gal-title', text: p.name }), h('span', { class: 'gal-sub', text: [p.artist, p.date].filter(Boolean).join(', ') })],
      strip(teaser),
      function (body) {
        body.classList.add('with-ref');
        body.append(refFigure(p, 'gal-ref'));
        var grid = h('div', { class: 'grid', style: '--n:' + D.widths.length });
        D.models.forEach(function (m) {
          var row = h('div', { class: 'row', role: 'group', 'aria-label': m.label },
            h('div', { class: 'row-label' }, h('span', { text: m.label })));
          D.widths.forEach(function (w) { row.append(cell(p.id, w, m.id, 'model')); });
          grid.append(row);
        });
        body.append(grid);
      }, [p.id]);
  }

  function modelGallery(m, apart) {
    var largest = D.widths[D.widths.length - 1];
    var teaser = [];
    D.paintings.forEach(function (p) {
      var a = (cells.get(p.id + '|' + largest + '|' + m.id) || [])[0];
      if (a && a.src) teaser.push(stripImg(a.src, a.w, a.h, 'px'));
    });
    var sub = m.sub;
    return gallery('model-' + m.id,
      [h('span', { class: 'gal-title', text: m.name || m.label }), sub ? h('span', { class: 'gal-sub', text: sub }) : null],
      strip(teaser),
      function (body) {
        var grid = h('div', { class: 'grid', style: '--n:' + D.widths.length });
        D.paintings.forEach(function (p) {
          var row = h('div', { class: 'row', role: 'group', 'aria-label': p.name },
            h('div', { class: 'row-label' }, p.ref ? refThumb(p, '') : null,
              h('span', {}, p.name, ' ', h('small', { text: p.artist }))));
          D.widths.forEach(function (w) { row.append(cell(p.id, w, m.id, 'painting')); });
          grid.append(row);
        });
        body.append(grid);
      }, apart ? [] : D.paintings.map(function (p) { return p.id; }));  // an entry kept apart is in no ranking set
  }

  function initGalleries() {
    var apartPanel = $('panel-apart');
    if (apartPanel) (D.apart || []).forEach(function (m) {
      var own = modelGallery(m, true);
      apartPanel.append(own);
      own.open = true;  // shown open: it is the whole of its section
    });
    var byPainting = $('panel-painting'), byModel = $('panel-model');
    if (!byPainting || !byModel) return;
    D.paintings.forEach(function (p) { byPainting.append(paintingGallery(p)); });
    var tabs = [$('tab-painting'), $('tab-model')];
    function select(tab) {
      tabs.forEach(function (other) {
        var on = other === tab;
        other.setAttribute('aria-selected', String(on));
        other.tabIndex = on ? 0 : -1;
        $(other.getAttribute('aria-controls')).hidden = !on;
      });
      if (tab === tabs[1]) {
        if (!byModel.firstChild) D.models.forEach(function (m) { byModel.append(modelGallery(m)); });
        markSeen(D.paintings.map(function (p) { return p.id; })); // each model's row of pictures sits under its name
      }
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab); });
      tab.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        var next = tabs[(i + 1) % tabs.length];
        select(next);
        next.focus();
        event.preventDefault();
      });
    });
    document.querySelector('.pictures').addEventListener('click', function (event) {
      var button = event.target.closest('.gal .pic');
      if (!button) return;
      openGallery({ p: button.getAttribute('data-p'), w: Number(button.getAttribute('data-w')), m: button.getAttribute('data-m'),
        n: Number(button.getAttribute('data-n')) || null }, button.getAttribute('data-axis'));
    });
  }

  /* The section of pictures at the larger size: its rows are in the page already. A picture opens enlarged, where the
     arrows step through the section's models and the sizes are the two shown side by side. */
  function initLarger() {
    var section = $('larger');
    if (!section || !D.larger) return;
    section.addEventListener('click', function (event) {
      var button = event.target.closest('.pic');
      if (!button) return;
      openGallery({ p: button.getAttribute('data-p'), w: Number(button.getAttribute('data-w')), m: button.getAttribute('data-m'),
        n: Number(button.getAttribute('data-n')) || null }, 'model',
      { widths: [D.larger.base, D.larger.width], models: D.larger.models.map(function (m) { return models.get(m.id); }) });
    });
    if (!('IntersectionObserver' in window)) return;
    var watcher = new IntersectionObserver(function (entries) { // a row on screen shows a painting's pictures under their makers' names
      markSeen(entries.filter(function (entry) { return entry.isIntersecting; }).map(function (entry) { return entry.target.getAttribute('data-p'); }));
    });
    [].forEach.call(section.querySelectorAll('.larger-row'), function (row) { watcher.observe(row); });
  }

  /* ------------------------------------------------------------ the enlarged view */

  var LB = null; // {mode: 'gallery', p, w, m, n, axis} or {mode: 'blind', p, w, items: [{label, a}], i}
  var dialog = null;

  function initLightbox() {
    dialog = $('lb');
    if (dialog && typeof dialog.showModal !== 'function') dialog = null; // an old browser: pictures simply do not enlarge
    if (!dialog) return;
    $('lb-close').addEventListener('click', function () { dialog.close(); });
    $('lb-prev').addEventListener('click', function () { step(-1); });
    $('lb-next').addEventListener('click', function () { step(1); });
    $('lb-swap').addEventListener('click', function () {
      var on = !dialog.classList.contains('swap');
      dialog.classList.toggle('swap', on);
      $('lb-swap').setAttribute('aria-pressed', String(on));
      $('lb-swap').textContent = on ? 'Show the typed picture' : 'Show the original';
    });
    $('lb-sizes').addEventListener('click', function (event) {
      var chip = event.target.closest('.chip');
      if (chip) resize(Number(chip.getAttribute('data-size')));
    });
    document.addEventListener('keydown', function (event) {
      if (!dialog.open || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowLeft') step(-1);
      else if (event.key === 'ArrowRight') step(1);
      else if (event.key === 'ArrowUp') resizeBy(1);
      else if (event.key === 'ArrowDown') resizeBy(-1);
      else return;
      event.preventDefault();
    });
    // A sideways swipe steps, as the arrows do.
    var down = null;
    var stage = $('lb-stage');
    stage.addEventListener('pointerdown', function (event) { down = { x: event.clientX, y: event.clientY, id: event.pointerId }; });
    stage.addEventListener('pointerup', function (event) {
      if (!down || down.id !== event.pointerId) return;
      var dx = event.clientX - down.x, dy = event.clientY - down.y;
      down = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
    });
    stage.addEventListener('pointercancel', function () { down = null; });
    // The browser's Back closes the view instead of leaving the page.
    dialog.addEventListener('close', function () {
      LB = null;
      if (history.state && history.state.paintbenchView) history.back();
    });
    window.addEventListener('popstate', function () {
      if (dialog.open) dialog.close();
      // One task later, not now: put back while the entry is still being left, the browser scrolls to the address's
      // fragment and the visitor loses their place.
      setTimeout(function () { try { history.scrollRestoration = 'auto'; } catch (error) { /* an old browser */ } }, 0);
    });
  }

  function typedPictureShown() {
    dialog.classList.remove('swap');
    $('lb-swap').setAttribute('aria-pressed', 'false');
    $('lb-swap').textContent = 'Show the original';
  }

  function show() {
    if (!dialog.open) {
      typedPictureShown();
      dialog.showModal();
      // The browser's Back closes the view. 'manual' before the entry is added, or leaving it scrolls the page to the
      // address's fragment (see the popstate handler).
      try {
        history.scrollRestoration = 'manual';
        history.pushState({ paintbenchView: true }, '');
      } catch (error) { /* a page that may not touch history still works */ }
    }
    render();
  }

  /* `among`, where given, narrows what the view steps through: {widths: [...], models: [...]}. */
  function openGallery(a, axis, among) {
    if (!dialog) return;
    LB = { mode: 'gallery', p: a.p, w: a.w, m: a.m, n: a.n || null, axis: axis === 'painting' ? 'painting' : 'model',
      widths: (among && among.widths) || D.widths, models: (among && among.models) || D.models };
    show();
  }

  function openBlind(p, w, items, i) {
    if (!dialog) return;
    LB = { mode: 'blind', p: p, w: w, items: items, i: i };
    show();
  }

  /* What the arrows step through: every attempt of the set (by model), or one model's attempts at this size (by painting). */
  function sequence() {
    var list = [];
    if (LB.axis === 'painting') {
      D.paintings.forEach(function (p) {
        var found = cells.get(p.id + '|' + LB.w + '|' + LB.m) || [];
        if (!found.length) list.push({ p: p.id, m: LB.m, n: null });
        found.forEach(function (a) { list.push({ p: p.id, m: LB.m, n: a.n }); });
      });
    } else {
      LB.models.forEach(function (m) {
        var found = cells.get(LB.p + '|' + LB.w + '|' + m.id) || [];
        if (!found.length) list.push({ p: LB.p, m: m.id, n: null });
        found.forEach(function (a) { list.push({ p: LB.p, m: m.id, n: a.n }); });
      });
    }
    return list;
  }

  function step(by) {
    if (!LB) return;
    if (LB.mode === 'blind') {
      LB.i = (LB.i + by + LB.items.length) % LB.items.length;
    } else {
      var list = sequence();
      var at = list.findIndex(function (x) { return x.p === LB.p && x.m === LB.m && x.n === LB.n; });
      var next = list[((at < 0 ? 0 : at) + by + list.length) % list.length];
      LB.p = next.p; LB.m = next.m; LB.n = next.n;
    }
    typedPictureShown(); // a step shows the next picture, not the real painting again
    render();
  }

  function resize(width) {
    if (!LB || LB.mode !== 'gallery' || LB.widths.indexOf(width) < 0) return;
    LB.w = width;
    var found = cells.get(LB.p + '|' + LB.w + '|' + LB.m) || [];
    if (!found.some(function (a) { return a.n === LB.n; })) LB.n = found.length ? found[0].n : null;
    typedPictureShown();
    render();
  }

  function resizeBy(by) {
    if (!LB || LB.mode !== 'gallery') return;
    var at = LB.widths.indexOf(LB.w) + by;
    if (at >= 0 && at < LB.widths.length) resize(LB.widths[at]);
  }

  function render() {
    var p = paintings.get(LB.p);
    var blind = LB.mode === 'blind';
    var a = blind ? LB.items[LB.i].a : byId.get(LB.p + '/' + LB.w + '/' + LB.m + '/' + LB.n);
    $('lb-title').textContent = p.name + (p.artist ? ', ' + p.artist : '');
    dialog.classList.toggle('no-ref', !p.ref);
    $('lb-stage').classList.toggle('has-ref', !!p.ref);
    var ref = $('lb-ref');
    if (p.ref && ref.getAttribute('data-p') !== p.id) {
      ref.replaceChildren(refImg(p, true), h('figcaption', {}, 'The original.', creditNode(p)));
      ref.setAttribute('data-p', p.id);
    } else if (!p.ref) {
      ref.replaceChildren();
      ref.removeAttribute('data-p');
    }
    var what = $('lb-what'), pic = $('lb-pic');
    if (blind) {
      var item = LB.items[LB.i];
      pic.replaceChildren(pictureImg(a, 'Picture ' + item.label + ', maker hidden', true), h('figcaption', { text: a.w + ' × ' + a.h + ' cells' }));
      what.replaceChildren(h('b', { text: 'Picture ' + item.label }), h('small', { text: 'Now ' + ordinal(LB.i + 1) + ' of ' + LB.items.length + ' in your order' }));
      $('lb-sizes').replaceChildren();
      $('lb-sizes').removeAttribute('data-sizes');
      $('lb-prev').setAttribute('aria-label', 'Previous picture');
      $('lb-next').setAttribute('aria-label', 'Next picture');
      return;
    }
    markSeen([LB.p]); // the enlarged view names the maker
    var model = models.get(LB.m);
    var height = (a && a.h) || heightAt(LB.p, LB.w);
    var facts = [LB.w + ' × ' + (height || '?') + ' cells'];
    if (a && a.src) {
      var place = standing.get(idOf(a));
      if (place) facts.push('judged ' + placed(place) + ' of ' + place.of + ' at this size');
      if (a.secs) facts.push('took ' + duration(a.secs));
      pic.replaceChildren(pictureImg(a, altFor(a), true)); // the maker's name is in the bar below
    } else {
      pic.replaceChildren(noPicture(a, LB.p, LB.w, true));
    }
    var same = cells.get(LB.p + '|' + LB.w + '|' + LB.m) || [];
    if (same.length > 1 && a) facts.push('attempt ' + a.n + ' of ' + same.length);
    what.replaceChildren(h('b', { text: model.label }), h('small', { text: facts.join(' · ') }));
    var chips = $('lb-sizes');
    var widths = LB.widths;
    if (chips.getAttribute('data-sizes') !== widths.join(' ')) {
      chips.replaceChildren.apply(chips, widths.map(function (w) {
        return h('button', { type: 'button', class: 'chip', 'data-size': w }, String(w), h('span', { class: 'sr-only' }));
      }));
      chips.setAttribute('data-sizes', widths.join(' '));
    }
    widths.forEach(function (w, i) { // changed in place, so that a chip keeps the focus when it is pressed
      var has = (cells.get(LB.p + '|' + w + '|' + LB.m) || []).some(function (x) { return x.src; });
      chips.children[i].className = 'chip' + (has ? '' : ' none');
      chips.children[i].setAttribute('aria-pressed', String(w === LB.w));
      chips.children[i].lastChild.textContent = has ? ' cells wide' : ' cells wide, no picture';
    });
    var unit = LB.axis === 'painting' ? 'painting' : 'model';
    $('lb-prev').setAttribute('aria-label', 'Previous ' + unit);
    $('lb-next').setAttribute('aria-label', 'Next ' + unit);
  }

  /* ------------------------------------------------------------ rank them yourself */

  var G = null; // the set on the table: {set, labels: {letter: attempt id}, shown: [letter], startedAt, moves, done}
  var list = null;
  var inView = false; // whether the pictures to rank are on screen
  var memory = []; // rankings, when this browser gives the page no storage

  function stored() {
    try {
      var kept = JSON.parse(localStorage.getItem(LS_RANKINGS) || '[]');
      return Array.isArray(kept) ? kept : [];
    } catch (error) { return memory; }
  }
  /* true if the browser's storage took them; false: they are kept for this visit only. */
  function store(entries) {
    entries = entries.slice(-KEPT);
    memory = entries;
    try { localStorage.setItem(LS_RANKINGS, JSON.stringify(entries)); return true; } catch (error) { return false; }
  }
  function randomHex(bytes) {
    var values = new Uint8Array(bytes);
    crypto.getRandomValues(values);
    return Array.prototype.map.call(values, function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }
  function browserId() {
    try {
      var id = localStorage.getItem(LS_ID);
      if (!/^[0-9a-f]{32}$/.test(id || '')) {
        id = randomHex(16);
        localStorage.setItem(LS_ID, id);
      }
      return id;
    } catch (error) {
      browserId.once = browserId.once || randomHex(16);
      return browserId.once;
    }
  }
  function shuffled(items) {
    var out = items.slice(), pick = new Uint32Array(1);
    for (var i = out.length - 1; i > 0; i--) {
      crypto.getRandomValues(pick);
      var j = pick[0] % (i + 1), kept = out[i];
      out[i] = out[j];
      out[j] = kept;
    }
    return out;
  }

  function rankable() { return D.sets.filter(function (s) { return s.rankable; }); }

  /* The rankings this browser has handed in, by set: {'painting|width': record}, the latest of each. A ranking
     counts only while its set still holds the pictures it was made on. */
  function ranked() {
    var out = {};
    stored().forEach(function (entry) {
      var r = entry && entry.record;
      if (!r || r.run_id !== D.run.id) return;
      var s = sets.get(r.painting + '|' + r.width);
      if (!s || !s.rankable || r.pictures_digest !== s.digest) return;
      var letters = r.labels && typeof r.labels === 'object' ? Object.keys(r.labels) : [];
      var same = letters.length === s.pictures.length && s.pictures.every(function (id) { return letters.some(function (l) { return r.labels[l] === id; }); });
      var whole = Array.isArray(r.ranking) && r.ranking.length === letters.length && letters.every(function (l) { return r.ranking.indexOf(l) >= 0; });
      if (same && whole) out[s.p + '|' + s.w] = r;
    });
    return out;
  }

  /* The selects mark what is ranked: a size once its set is, a painting once all of its sizes are. */
  function markPicks() {
    var done = ranked(), pick = $('g-painting'), size = $('g-width');
    [].forEach.call(pick.options, function (o) {
      var all = rankable().filter(function (s) { return s.p === o.value; });
      o.text = paintings.get(o.value).name + (all.length && all.every(function (s) { return done[s.p + '|' + s.w]; }) ? ' ✓' : '');
    });
    [].forEach.call(size.options, function (o) {
      o.text = o.value + ' wide' + (done[pick.value + '|' + o.value] ? ' ✓' : '');
    });
  }

  function initGame() {
    var game = $('game');
    list = $('g-list');
    if (!game || !list || !rankable().length) return;
    var pick = $('g-painting'), size = $('g-width');
    D.paintings.forEach(function (p) {
      if (rankable().some(function (s) { return s.p === p.id; })) pick.append(h('option', { value: p.id, text: p.name }));
    });
    function sizes(p, keep) {
      size.replaceChildren();
      rankable().filter(function (s) { return s.p === p; }).forEach(function (s) {
        size.append(h('option', { value: s.w, text: s.w + ' wide' }));
      });
      if (keep && [].some.call(size.options, function (o) { return o.value === String(keep); })) size.value = String(keep);
    }
    function deal(s, kept) {
      pick.value = s.p;
      sizes(s.p, s.w);
      dealSet(s, kept);
    }
    /* An order the visitor has worked on is not dealt over without asking. false: stay, and the selects say so again. */
    function mayLeave() {
      if (!G || G.done || !G.moves || window.confirm('Leave this set? Your order will be lost.')) return true;
      pick.value = G.set.p;
      sizes(G.set.p, G.set.w);
      return false;
    }
    pick.addEventListener('change', function () {
      var wanted = pick.value;
      if (!mayLeave()) return;
      sizes(wanted, G && G.set.w);
      dealSet(sets.get(wanted + '|' + size.value));
    });
    size.addEventListener('change', function () {
      var wanted = size.value;
      if (mayLeave()) dealSet(sets.get(pick.value + '|' + wanted));
    });
    $('g-random').addEventListener('click', function () { if (mayLeave()) deal(randomSet()); });
    $('g-submit').addEventListener('click', submit);
    initSorting();
    // The time a ranking took runs from when its pictures were on screen, not from when the page loaded.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[entries.length - 1].isIntersecting;
        if (inView && G && G.startedAt === null) G.startedAt = Date.now();
      }).observe(list);
    } else {
      inView = true;
    }
    $('g-privacy').textContent = CONFIG.endpoint
      ? 'Submitting sends your ranking to this site’s owner, anonymously.'
      : 'Your ranking stays in this browser.';
    game.hidden = false;
    var kept = keptSet();
    if (kept) deal(kept.set, kept); else deal(randomSet());
  }

  /* A set this browser has not ranked yet, away from the smallest size where there is a choice: those pictures are
     the hardest to tell apart, and any set can still be chosen by hand. */
  function randomSet() {
    var all = rankable();
    var done = ranked();
    var current = G ? G.set : null;
    var smallest = Math.min.apply(null, all.map(function (s) { return s.w; }));
    var largest = Math.max.apply(null, all.map(function (s) { return s.w; }));
    var known = seen(), example = heroPainting();
    function fresh(s) { return !done[s.p + '|' + s.w] && s !== current; }
    // The first choice that leaves anything: a painting whose makers this browser has not been shown, and never
    // the painting of the examples at the top while another is left.
    var wishes = [
      // the largest size first: it shows the most
      function (s) { return fresh(s) && s.w === largest && !known[s.p] && s.p !== example; },
      function (s) { return fresh(s) && s.w === largest && s.p !== example; },
      function (s) { return fresh(s) && s.w > smallest && !known[s.p] && s.p !== example; },
      function (s) { return fresh(s) && !known[s.p] && s.p !== example; },
      function (s) { return fresh(s) && s.w > smallest && s.p !== example; },
      function (s) { return fresh(s) && s.p !== example; },
      fresh,
      function (s) { return s !== current; }
    ];
    for (var i = 0; i < wishes.length; i++) {
      var from = all.filter(wishes[i]);
      if (from.length) return shuffled(from)[0];
    }
    return shuffled(all)[0];
  }

  /* What is on the table, kept for this tab: a reload brings back the same set under the same letters in the order made so far. */
  var SS_SET = 'paintbench.set';

  function keep() {
    try {
      if (!G || G.done) sessionStorage.removeItem(SS_SET);
      else sessionStorage.setItem(SS_SET, JSON.stringify({ version: D.data_version, p: G.set.p, w: G.set.w, labels: G.labels, shown: G.shown, order: order(), moves: G.moves }));
    } catch (error) { /* no storage: a reload deals afresh */ }
  }

  function keptSet() {
    try {
      var kept = JSON.parse(sessionStorage.getItem(SS_SET) || 'null');
      var s = kept && kept.version === D.data_version ? sets.get(kept.p + '|' + kept.w) : null;
      if (!s || !s.rankable) return null;
      var letters = Object.keys(kept.labels || {});
      var same = letters.length === s.pictures.length && s.pictures.every(function (id) { return letters.some(function (l) { return kept.labels[l] === id; }); });
      var whole = function (list) { return Array.isArray(list) && list.length === letters.length && letters.every(function (l) { return list.indexOf(l) >= 0; }); };
      if (!same || !whole(kept.shown) || !whole(kept.order)) return null;
      return { set: s, labels: kept.labels, shown: kept.shown, order: kept.order, moves: Number(kept.moves) || 0 };
    } catch (error) { return null; }
  }

  /* Deal a set: shuffled under fresh letters, or as `kept` holds it from before a reload. A set this browser has
     ranked is not dealt again: it comes up as it was handed in, with the makers' names, and says so. */
  function dealSet(s, kept) {
    if (!s) return;
    var mine = ranked()[s.p + '|' + s.w];
    var labels = {}, shown;
    if (mine) {
      kept = null;
      labels = mine.labels;
      shown = mine.ranking;
    } else if (kept) {
      labels = kept.labels;
      shown = kept.shown;
    } else {
      var mixed = shuffled(s.pictures);
      mixed.forEach(function (id, i) { labels[D.letters[i]] = id; });
      shown = mixed.map(function (_, i) { return D.letters[i]; });
    }
    G = { set: s, labels: labels, shown: shown, startedAt: inView ? Date.now() : null, moves: kept ? kept.moves : 0, done: !!mine };
    var p = paintings.get(s.p);
    if (p.ref) {
      // The credit sits under the painting where there is room beside the cards, and under the cards on a narrow screen,
      // where the painting stays in sight above them and has to stay small. The styles show one of the two.
      $('g-ref').replaceChildren(refImg(p), h('figcaption', {}, h('b', { text: 'The original. ' }), p.name, creditNode(p)));
      $('g-credit').replaceChildren(creditNode(p));
    } else {
      $('g-ref').replaceChildren();
      $('g-credit').replaceChildren();
    }
    list.classList.remove('done');
    list.replaceChildren.apply(list, (kept ? kept.order : shown).map(card));
    renumber();
    keep();
    $('g-actions').hidden = false;
    $('g-submit').disabled = false;
    $('g-instr').hidden = false;
    $('g-result').hidden = true;
    $('g-result').replaceChildren();
    $('g-ranked').hidden = true;
    $('g-live').textContent = '';
    if (mine) reveal(mine, true);
    markPicks();
  }

  function card(letter) {
    var a = byId.get(G.labels[letter]);
    return h('li', { class: 'rank-card', 'data-label': letter, tabindex: '0', 'aria-roledescription': 'picture to place' },
      h('div', { class: 'rank-bar' },
        h('span', { class: 'rank-pos' }),
        h('span', { class: 'rank-grip', 'aria-hidden': 'true', text: '⋮⋮' }),
        h('button', { type: 'button', class: 'mv', 'data-by': '-1', tabindex: '-1', 'aria-label': 'Move picture ' + letter + ' earlier', text: '←' }),
        h('button', { type: 'button', class: 'mv', 'data-by': '1', tabindex: '-1', 'aria-label': 'Move picture ' + letter + ' later', text: '→' }),
        h('button', { type: 'button', class: 'mv zoom', tabindex: '-1', 'aria-label': 'Enlarge picture ' + letter, text: '⤢' })),
      h('button', { type: 'button', class: 'pic rank-pic', tabindex: '-1', 'aria-label': 'Select picture ' + letter },
        pictureImg(a, 'Picture ' + letter + ', maker hidden', true)));
  }

  function cards() { return [].slice.call(list.querySelectorAll('.rank-card')); }
  function order() { return cards().map(function (c) { return c.getAttribute('data-label'); }); }

  function renumber() {
    // While a card is carried it counts where its gap is, so the numbers show the order a drop would give.
    var carried = list.querySelector('.rank-card.dragging'), gap = list.querySelector('.rank-ph');
    var all = [];
    [].forEach.call(list.children, function (node) {
      if (node === gap && carried) all.push(carried);
      else if (node !== carried && node.classList.contains('rank-card')) all.push(node);
    });
    all.forEach(function (c, i) {
      c.querySelector('.rank-pos').textContent = String(i + 1);
      if (!G.done) c.setAttribute('aria-label', 'Picture ' + c.getAttribute('data-label') + ', ' + ordinal(i + 1) + ' of ' + all.length);
      var buttons = c.querySelectorAll('.mv');
      if (buttons.length) {
        buttons[0].disabled = i === 0;
        buttons[1].disabled = i === all.length - 1;
      }
    });
  }

  function say(text) { $('g-live').textContent = text; }

  /* Move a card to a new place among the others, sliding the ones it passes. */
  function moveTo(cardNode, to) {
    var all = cards(), from = all.indexOf(cardNode);
    to = Math.max(0, Math.min(all.length - 1, to));
    if (G.done || from < 0 || to === from) return;
    var before = new Map();
    all.forEach(function (c) { before.set(c, c.getBoundingClientRect()); });
    if (to < from) all[to].before(cardNode); else all[to].after(cardNode);
    G.moves++;
    renumber();
    keep();
    // Where every card is now, read before anything moves on screen. Then the page follows the card, and only then
    // do the cards slide: a card that is drawn at its old place while it slides gives the browser nothing to scroll to.
    var after = new Map();
    cards().forEach(function (c) { after.set(c, c.getBoundingClientRect()); });
    cardNode.scrollIntoView({ block: 'nearest' });
    if (!reducedMotion() && cardNode.animate) {
      cards().forEach(function (c) {
        var was = before.get(c), now = after.get(c);
        if (was.left !== now.left || was.top !== now.top) {
          c.animate([{ transform: 'translate(' + (was.left - now.left) + 'px,' + (was.top - now.top) + 'px)' }, { transform: 'none' }],
            { duration: 170, easing: 'ease-out' });
        }
      });
    }
    say('Picture ' + cardNode.getAttribute('data-label') + ', now ' + (to + 1) + ' of ' + all.length + '.');
  }

  /* How many cards the first row of the grid holds as it is laid out now. */
  function columns() {
    var all = cards();
    if (!all.length) return 1;
    var top = all[0].offsetTop;
    return all.filter(function (c) { return c.offsetTop === top; }).length || 1;
  }

  function initSorting() {
    function enlarge(cardNode) {
      if (G.done) {
        openGallery(byId.get(G.labels[cardNode.getAttribute('data-label')]), 'model');
      } else {
        var items = order().map(function (letter) { return { label: letter, a: byId.get(G.labels[letter]) }; });
        openBlind(G.set.p, G.set.w, items, cards().indexOf(cardNode));
      }
    }
    // A click on a picture selects it (the arrow keys then move it); its ⤢ button, or Enter, enlarges it.
    list.addEventListener('click', function (event) {
      var cardNode = event.target.closest('.rank-card');
      if (!cardNode) return;
      if (list.justDragged) return;
      var button = event.target.closest('.mv');
      if (button && button.classList.contains('zoom')) { enlarge(cardNode); return; }
      if (button) {
        moveTo(cardNode, cards().indexOf(cardNode) + Number(button.getAttribute('data-by')));
        return;
      }
      if (G.done && event.target.closest('.rank-pic')) { enlarge(cardNode); return; }
      cardNode.focus({ preventScroll: true });
    });
    // Shift, pressed and let go by itself, selects the next picture (the first, if none is selected).
    var shiftAlone = false;
    document.addEventListener('keydown', function (event) { shiftAlone = event.key === 'Shift' ? (event.repeat ? shiftAlone : true) : false; });
    document.addEventListener('keyup', function (event) {
      if (event.key !== 'Shift' || !shiftAlone) return;
      shiftAlone = false;
      if (!G || G.done || $('game').hidden) return;
      var active = document.activeElement, inside = active && list.contains(active);
      if (!inside && active && active !== document.body) return; // working elsewhere on the page
      var all = cards();
      if (!all.length) return;
      var at = inside ? all.indexOf(active.closest('.rank-card')) : -1;
      all[(at + 1) % all.length].focus();
    });
    list.addEventListener('keydown', function (event) {
      var cardNode = event.target.closest('.rank-card');
      if (!cardNode || event.altKey || event.ctrlKey || event.metaKey) return;
      if ((event.key === 'Enter' || event.key === ' ') && event.target === cardNode) { // before the ranking is in and after it
        enlarge(cardNode);
        event.preventDefault();
        return;
      }
      if (G.done) return;
      // Left and Right move the picture one place. Up and Down move it to the place above or below it in the grid as
      // it is laid out now: a whole row earlier or later. Below the last full row, Down goes to the last place.
      var all = cards(), at = all.indexOf(cardNode), last = all.length - 1, across = columns(), to = null;
      if (event.key === 'ArrowLeft') to = at - 1;
      else if (event.key === 'ArrowRight') to = at + 1;
      else if (event.key === 'ArrowUp') to = at - across;
      else if (event.key === 'ArrowDown') to = at + across <= last ? at + across : Math.floor(at / across) < Math.floor(last / across) ? last : at;
      else if (event.key === 'Home') to = 0;
      else if (event.key === 'End') to = last;
      else return;
      event.preventDefault(); // the key is the card's: the page does not scroll, whether or not there is a place to go
      if (to < 0 || to > last || to === at) return;
      moveTo(cardNode, to);
      cardNode.focus({ preventScroll: true });
    });

    // Dragging. A mouse may take a card anywhere; a finger or a pen takes it by its bar, so that the page still scrolls.
    var drag = null;
    function finish() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!drag) return;
      var d = drag;
      drag = null;
      if (!d.active) { window.removeEventListener("keydown", cancelDrag, true); return; }
      cancelAnimationFrame(d.frame);
      d.holder.replaceWith(d.card);
      d.card.classList.remove('dragging');
      d.card.style.cssText = '';
      document.documentElement.classList.remove('is-dragging');
      window.removeEventListener("keydown", cancelDrag, true);
      var to = cards().indexOf(d.card);
      if (to !== d.from) {
        G.moves++;
        say('Picture ' + d.card.getAttribute('data-label') + ', now ' + (to + 1) + ' of ' + cards().length + '.');
      }
      renumber();
      keep();
      list.justDragged = true; // the click that ends a drag is not a request to enlarge
      setTimeout(function () { list.justDragged = false; }, 0);
    }
    function cancelDrag(event) { // Escape during a drag: the picture goes back where it was lifted
      if (event.key !== 'Escape' || !drag || !drag.active) return;
      event.preventDefault();
      event.stopPropagation();
      var at = cards().filter(function (c) { return c !== drag.card; })[drag.from];
      if (at) at.before(drag.holder); else list.append(drag.holder);
      finish();
    }
    function place(x, y) {
      drag.card.style.left = (x - drag.dx) + 'px';
      drag.card.style.top = (y - drag.dy) + 'px';
      var under = document.elementFromPoint(x, y);
      var over = under && under.closest ? under.closest('.rank-card') : null;
      if (over && over !== drag.card && over.parentNode === list) {
        if (drag.holder.compareDocumentPosition(over) & Node.DOCUMENT_POSITION_FOLLOWING) over.after(drag.holder);
        else over.before(drag.holder);
        renumber();
      }
    }
    function scrollNearEdges() {
      if (!drag || !drag.active) return;
      var edge = 70, speed = 0;
      if (drag.y < edge) speed = -Math.ceil((edge - drag.y) / 6);
      else if (drag.y > window.innerHeight - edge) speed = Math.ceil((drag.y - (window.innerHeight - edge)) / 6);
      if (speed) {
        window.scrollBy(0, speed);
        place(drag.x, drag.y);
      }
      drag.frame = requestAnimationFrame(scrollNearEdges);
    }
    function move(event) {
      if (!drag || event.pointerId !== drag.id) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (!drag.active) {
        if (Math.abs(drag.x - drag.x0) + Math.abs(drag.y - drag.y0) < 6) return;
        var box = drag.card.getBoundingClientRect();
        drag.dx = drag.x0 - box.left;
        drag.dy = drag.y0 - box.top;
        drag.from = cards().indexOf(drag.card);
        drag.holder = h('li', { class: 'rank-ph', 'aria-hidden': 'true', style: 'height:' + box.height + 'px' });
        drag.card.before(drag.holder);
        drag.card.style.width = box.width + 'px';
        drag.card.style.height = box.height + 'px';
        drag.card.classList.add('dragging');
        document.documentElement.classList.add('is-dragging');
        drag.active = true;
        renumber();
        drag.frame = requestAnimationFrame(scrollNearEdges);
      }
      event.preventDefault();
      place(drag.x, drag.y);
    }
    function up(event) {
      if (drag && event.pointerId === drag.id) finish();
    }
    list.addEventListener('pointerdown', function (event) {
      if (G.done || drag || event.button > 0 || event.target.closest('.mv')) return;
      var cardNode = event.target.closest('.rank-card');
      if (!cardNode) return;
      var onBar = !!event.target.closest('.rank-bar');
      if (event.pointerType !== 'mouse' && !onBar) return;
      drag = { card: cardNode, id: event.pointerId, x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY, active: false };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      window.addEventListener("keydown", cancelDrag, true);
    });
    list.addEventListener('dragstart', function (event) { event.preventDefault(); });
  }

  /* ------------------------------------------------------------ handing a ranking in */

  function submit() {
    if (!G || G.done) return;
    if (!G.moves && !window.confirm('You have not moved any picture. Submit the order as it is?')) return;
    G.done = true;
    var ranking = order();
    var record = {
      kind: 'site-ranking',
      schema: 2,
      record_id: randomHex(16),
      browser_id: browserId(),
      run_id: D.run.id,
      site_version: String(D.site_version),
      data_version: String(D.data_version),
      painting: G.set.p,
      width: G.set.w,
      height: G.set.h,
      labels: G.labels,
      order_shown: G.shown,
      ranking: ranking,
      ranking_attempts: ranking.map(function (letter) { return G.labels[letter]; }),
      pictures_digest: G.set.digest,
      seen_labelled: !!seen()[G.set.p],
      seconds: G.startedAt === null ? 0 : Math.max(0, Math.min(86400, Math.round((Date.now() - G.startedAt) / 1000))),
      moves: Math.min(G.moves, 100000),
      ranked_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z')
    };
    var entries = stored();
    // A ranking handed in while the page collects none is marked so, and is never sent later. One that is to be sent
    // is kept with where it was to go, and is tried again only there.
    entries.push({ record: record, sent: CONFIG.endpoint ? false : 'local', to: destination() });
    var kept = store(entries);
    reveal(record);
    markPicks();
    markSeen([G.set.p]); // the makers of this painting's pictures are on the page now
    var note = $('g-saved');
    if (!CONFIG.endpoint) {
      note.textContent = kept ? 'Saved in this browser.' : '';
      return;
    }
    note.textContent = 'Sending your ranking…';
    send(record).then(function (outcome) {
      mark(record.record_id, outcome);
      note.textContent = outcome === true ? 'Saved. Thank you.'
        : (outcome === 'refused' ? 'Not accepted by the server.' : 'Could not be sent.') + (kept ? ' Saved in this browser.' : '');
    });
  }

  /* true: stored. 'refused': the server answered and will not take it. false: no answer, worth another try. */
  function send(record) {
    return fetch(CONFIG.endpoint, {
      method: 'POST', mode: 'cors', credentials: 'omit', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record)
    }).then(function (response) {
      if (response.ok) return true;
      return response.status >= 400 && response.status < 500 && response.status !== 429 ? 'refused' : false;
    }).catch(function () { return false; });
  }

  function mark(recordId, outcome) {
    var entries = stored();
    entries.forEach(function (entry) {
      if (entry.record && entry.record.record_id === recordId) entry.sent = outcome;
    });
    store(entries);
  }

  /* Where rankings go, as a whole address, or null if the page collects none. */
  function destination() {
    if (!CONFIG.endpoint) return null;
    try { return new URL(CONFIG.endpoint, document.baseURI).href; } catch (error) { return CONFIG.endpoint; }
  }

  function retryUnsent() {
    var to = destination();
    if (!to) return;
    stored().filter(function (entry) { return entry && entry.record && entry.sent === false && entry.to === to; }).slice(0, 20).forEach(function (entry) {
      send(entry.record).then(function (outcome) { if (outcome) mark(entry.record.record_id, outcome); });
    });
  }

  /* The board once a ranking is in: each picture under its maker's name, and the judges' order. `earlier`: the
     ranking was handed in before, and the set has just been opened again. */
  function reveal(record, earlier) {
    var s = G.set;
    var judged = { get: function (id) { return s.order.length >= 2 ? standing.get(id) : undefined; } };
    list.classList.add('done');
    cards().forEach(function (c, i) {
      var letter = c.getAttribute('data-label');
      var a = byId.get(G.labels[letter]);
      var model = models.get(a.m);
      var theirs = judged.get(idOf(a));
      c.removeAttribute('aria-roledescription');
      c.setAttribute('aria-label', 'Your ' + ordinal(i + 1) + ': ' + model.label + (theirs ? ', the judges’ ' + placed(theirs) : ''));
      c.querySelector('.rank-pic').setAttribute('aria-label', 'Enlarge the picture by ' + model.label);
      c.querySelector('img').alt = altFor(a);
      c.append(h('div', { class: 'rank-name' }, h('b', { text: model.label }),
        h('small', { text: theirs ? 'Judges: ' + placed(theirs) : 'Not judged' })));
    });
    $('g-actions').hidden = true;
    $('g-instr').hidden = true;
    $('g-ranked').hidden = false;

    var result = $('g-result');
    var parts = [];
    if (s.order.length >= 2) {
      var same = 0, pairs = 0;
      var mine = record.ranking_attempts;
      for (var i = 0; i < mine.length; i++) {
        for (var j = i + 1; j < mine.length; j++) {
          var x = judged.get(mine[i]), y = judged.get(mine[j]);
          if (!x || !y || x.rank === y.rank) continue; // not judged, or level for the judges: neither order is theirs
          pairs++;
          if (x.rank < y.rank) same++;
        }
      }
      var label = function (id) { return models.get(byId.get(id).m).label; };
      var tops = s.order.filter(function (entry) { return judged.get(entry.a).rank === 1; }).map(function (entry) { return entry.a; });
      var verdict = pairs && same === pairs ? 'You agree with the judges on every pair.'
        : 'You agree with the judges on ' + same + ' of ' + pairs + ' pairs.';
      verdict += tops.indexOf(mine[0]) >= 0 ? ' Same first pick: ' + label(mine[0]) + '.'
        : ' Your first: ' + label(mine[0]) + '. Theirs: ' + tops.map(label).join(' or ') + '.';
      parts.push(h('p', { class: 'verdict', text: verdict }));
      parts.push(h('div', {}, h('p', { class: 'demo-label', text: 'The judges’ order' }),
        h('ol', { class: 'judge-row' }, s.order.map(function (entry, i) {
          var a = byId.get(entry.a);
          var place = judged.get(entry.a);
          return h('li', {}, pictureImg(a, ''), h('b', { text: place.rank + (place.tied ? '=' : '') }), models.get(a.m).label);
        }))));
    } else {
      parts.push(h('p', { class: 'verdict', text: 'The judges did not rank this set.' }));
    }
    parts.push(h('p', { class: 'saved', id: 'g-saved' }));
    var again = h('button', { type: 'button', class: 'btn primary', text: 'Rank another set' });
    again.addEventListener('click', function () {
      $('g-random').click();
      $('rank').scrollIntoView({ block: 'start' });
      var first = list.querySelector('.rank-card');
      if (first) first.focus({ preventScroll: true });
    });
    parts.push(h('div', { class: 'result-actions' }, again, h('a', { class: 'btn', href: '#results', text: 'See the results' })));
    result.replaceChildren.apply(result, parts);
    result.hidden = false;
    keep();
    if (earlier) { say('You ranked this set. Each picture shows its maker.'); return; } // the focus stays where the set was chosen
    parts[0].setAttribute('tabindex', '-1'); // the first line of the result takes the focus the hidden button had
    parts[0].focus({ preventScroll: true });
    say('Your order is set. Each picture now shows its maker.');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
