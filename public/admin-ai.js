(() => {
  const btn = document.getElementById('admin-ai-btn');
  const panel = document.getElementById('admin-ai-panel');
  if (!btn || !panel) return;
  const log = document.getElementById('admin-ai-log');
  const form = document.getElementById('admin-ai-form');
  const input = document.getElementById('admin-ai-input');
  const closeBtn = document.getElementById('admin-ai-close');
  const clearBtn = document.getElementById('admin-ai-clear');
  const history = [];
  const VULN_RE = /ثغر|ثغرات|vulnerab|exploit|xss|csrf|sql|injection|idor|bypass/i;

  const scrollDown = () => { log.scrollTop = log.scrollHeight; };

  const addUser = (text) => {
    const div = document.createElement('div');
    div.className = 'ai-msg ai-me';
    div.textContent = text;
    log.appendChild(div);
    scrollDown();
  };

  const addTyping = () => {
    const div = document.createElement('div');
    div.className = 'ai-msg ai-bot ai-typing';
    div.setAttribute('aria-live', 'polite');
    div.innerHTML = '<span></span><span></span><span></span>';
    log.appendChild(div);
    scrollDown();
    return div;
  };

  // Copy helper with a fallback for older browsers / non-secure contexts
  const copyText = async (text) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove();
    return ok;
  };

  const flash = (button, okText, originalText) => {
    button.textContent = okText;
    button.classList.add('done');
    setTimeout(() => { button.textContent = originalText; button.classList.remove('done'); }, 1600);
  };

  const makeCopyButton = (label, getText) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ai-copy';
    b.textContent = label;
    b.addEventListener('click', async () => {
      const ok = await copyText(getText());
      flash(b, ok ? 'تم النسخ ✓' : 'تعذر النسخ', label);
    });
    return b;
  };

  // Build safe DOM from the reply: code blocks, headings, lists, bold text, paragraphs.
  const appendInline = (el, text) => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    parts.forEach((p) => {
      if (!p) return;
      if (p.startsWith('**') && p.endsWith('**')) {
        const s = document.createElement('strong'); s.textContent = p.slice(2, -2); el.appendChild(s);
      } else if (p.startsWith('`') && p.endsWith('`')) {
        const c = document.createElement('code'); c.textContent = p.slice(1, -1); el.appendChild(c);
      } else {
        el.appendChild(document.createTextNode(p));
      }
    });
  };

  const renderReply = (container, text) => {
    const lines = text.split('\n');
    let i = 0, list = null, para = null;
    const closeBlocks = () => { list = null; para = null; };
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        closeBlocks();
        const codeLines = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { codeLines.push(lines[i]); i++; }
        i++; // skip closing fence
        const code = codeLines.join('\n');
        const wrap = document.createElement('div');
        wrap.className = 'ai-code';
        const bar = document.createElement('div');
        bar.className = 'ai-code-bar';
        const label = document.createElement('span');
        label.textContent = 'كود';
        bar.appendChild(label);
        bar.appendChild(makeCopyButton('نسخ الكود', () => code));
        const pre = document.createElement('pre');
        const codeEl = document.createElement('code');
        codeEl.textContent = code;
        pre.appendChild(codeEl);
        wrap.appendChild(bar);
        wrap.appendChild(pre);
        container.appendChild(wrap);
        continue;
      }
      if (!line.trim()) { closeBlocks(); i++; continue; }
      const h = line.match(/^\s*#{1,4}\s+(.*)$/);
      if (h) {
        closeBlocks();
        const el = document.createElement('h4'); appendInline(el, h[1]); container.appendChild(el);
        i++; continue;
      }
      const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (li) {
        if (!list) { list = document.createElement('ul'); container.appendChild(list); }
        para = null;
        const item = document.createElement('li'); appendInline(item, li[1]); list.appendChild(item);
        i++; continue;
      }
      if (!para) { para = document.createElement('p'); container.appendChild(para); list = null; }
      else { para.appendChild(document.createElement('br')); }
      appendInline(para, line);
      i++;
    }
  };

  const addBot = (text) => {
    const wrap = document.createElement('div');
    wrap.className = 'ai-msg ai-bot ai-rich';
    const body = document.createElement('div');
    body.className = 'ai-body';
    renderReply(body, text || '—');
    wrap.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'ai-actions';
    const isVuln = VULN_RE.test(text);
    actions.appendChild(makeCopyButton(isVuln ? 'نسخ الثغرات' : 'نسخ الرد', () => text));
    wrap.appendChild(actions);
    log.appendChild(wrap);
    scrollDown();
  };

  const showEmpty = () => {
    log.innerHTML = '';
    const intro = document.createElement('div');
    intro.className = 'ai-intro';
    intro.innerHTML = '<b>مساعد الإدارة</b><p class="muted">اسألني عن بنية المنصة أو الثغرات المحتملة وطرق إصلاحها.</p>';
    const chips = document.createElement('div');
    chips.className = 'ai-chips';
    [
      'حلّل صلاحيات المسارات الإدارية',
      'ما الثغرات المحتملة في رفع الملفات؟',
      'اقترح تحسينات أمنية للجلسات',
    ].forEach((t) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'ai-chip';
      c.textContent = t;
      c.addEventListener('click', () => { input.value = t; form.requestSubmit(); });
      chips.appendChild(c);
    });
    intro.appendChild(chips);
    log.appendChild(intro);
  };

  btn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) { input.focus(); if (!log.children.length) showEmpty(); }
  });
  closeBtn.addEventListener('click', () => { panel.hidden = true; });
  if (clearBtn) clearBtn.addEventListener('click', () => {
    history.length = 0; showEmpty(); input.focus();
  });

  // Enter sends, Shift+Enter adds a line
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (log.querySelector('.ai-intro')) log.innerHTML = '';
    input.value = '';
    history.push({ role: 'user', content: text });
    addUser(text);
    const wait = addTyping();
    try {
      const res = await fetch('/admin/ai/chat', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'فشل الطلب');
      history.push({ role: 'assistant', content: data.reply || '' });
      wait.remove();
      addBot(data.reply || '');
    } catch (err) {
      history.pop();
      wait.remove();
      const e2 = document.createElement('div');
      e2.className = 'ai-msg ai-error';
      e2.textContent = 'تعذر الحصول على رد: ' + err.message;
      log.appendChild(e2);
      scrollDown();
    }
  });
})();
