(function () {
  var root = document.getElementById('wa-root');
  if (!root) return;
  var csrf = root.dataset.csrf;
  var $ = function (id) { return document.getElementById(id); };
  var poll = null;

  function api(url, body) {
    return fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin'
    }).then(function (r) {
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('json') < 0) { location.reload(); throw new Error('reload'); }
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'حدث خطأ'); return j; });
    });
  }
  function msg(t, ok) { var m = $('wa-msg'); if (!m) return; m.textContent = t || ''; m.className = 'wa-msg ' + (ok ? 'ok' : 'err'); }

  // قائمة الدول: الاسم بالعربية + العلم + الرمز، مرتبة أبجدياً
  var sel = $('wa-country');
  if (sel && window.WA_DIAL) {
    var names; try { names = new Intl.DisplayNames(['ar'], { type: 'region' }); } catch (e) { names = null; }
    var flag = function (iso) { return String.fromCodePoint.apply(null, iso.split('').map(function (c) { return 127397 + c.charCodeAt(0); })); };
    var list = window.WA_DIAL.split(',').map(function (x) { var p = x.split(':'); return { iso: p[0], dial: p[1], name: names ? names.of(p[0]) : p[0] }; });
    list.sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
    list.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.dial; o.textContent = flag(c.iso) + ' ' + c.name + ' (+' + c.dial + ')';
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { var d = $('wa-dial'); if (d) d.textContent = sel.value ? '+' + sel.value : ''; });
  }

  function showCode(code, secs) {
    $('wa-form-box').hidden = true;
    $('wa-code-box').hidden = false;
    $('wa-code').textContent = code;
    var left = secs || 180, t = $('wa-timer');
    clearInterval(showCode.iv);
    showCode.iv = setInterval(function () {
      left--; if (t) t.textContent = Math.max(0, left) + ' ثانية';
      if (left <= 0) { clearInterval(showCode.iv); stopPoll(); msg('انتهت صلاحية الكود. اطلب كوداً جديداً.', false); resetForm(); }
    }, 1000);
    startPoll();
  }
  function resetForm() { $('wa-code-box').hidden = true; $('wa-form-box').hidden = false; var b = $('wa-go'); if (b) b.disabled = false; }
  function startPoll() {
    stopPoll();
    poll = setInterval(function () {
      api('/whatsapp/status').then(function (s) {
        if (s.state === 'open' || s.state === 'connecting') { stopPoll(); location.reload(); }
        else if (s.state === 'none' || s.state === 'failed') { stopPoll(); clearInterval(showCode.iv); msg('تعذّر الربط. اطلب كوداً جديداً.', false); resetForm(); }
      }).catch(function () {});
    }, 3000);
  }
  function stopPoll() { if (poll) { clearInterval(poll); poll = null; } }

  var form = $('wa-form');
  if (form) form.addEventListener('submit', function (ev) {
    ev.preventDefault(); msg('');
    var b = $('wa-go'); b.disabled = true; b.textContent = 'جارٍ طلب الكود…';
    api('/whatsapp/pair', { dial: sel.value, number: $('wa-number').value, consent: $('wa-consent').checked })
      .then(function (r) { b.textContent = 'احصل على كود الربط'; showCode(r.code, 180); })
      .catch(function (e) { b.disabled = false; b.textContent = 'احصل على كود الربط'; msg(e.message, false); });
  });

  var cancel = $('wa-cancel');
  if (cancel) cancel.addEventListener('click', function () { api('/whatsapp/unlink', {}).then(function () { stopPoll(); clearInterval(showCode.iv); resetForm(); msg(''); }); });
  var unl = $('wa-unlink');
  if (unl) unl.addEventListener('click', function () {
    if (!confirm('فك ربط واتساب؟ سيتوقف الرد الآلي ويُحذف الجهاز المرتبط.')) return;
    api('/whatsapp/unlink', {}).then(function () { location.reload(); }).catch(function (e) { msg(e.message, false); });
  });
  var tog = $('wa-ai');
  if (tog) tog.addEventListener('change', function () { api('/whatsapp/ai', { enabled: tog.checked }).catch(function (e) { msg(e.message, false); tog.checked = !tog.checked; }); });

  // لو فُتحت الصفحة والكود ما زال صالحاً
  var init = root.dataset.code;
  if (init) showCode(init, Number(root.dataset.left) || 120);
  else if (root.dataset.state === 'connecting') setTimeout(function () { api('/whatsapp/status').then(function (s) { if (s.state === 'open') location.reload(); }).catch(function () {}); }, 4000);
})();
