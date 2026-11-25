'use strict';
// ربط واتساب برمز الاقتران (Pairing Code) عبر Baileys، وردّ آلي بالذكاء الاصطناعي على الرسائل الخاصة.
// جلسة مستقلة لكل مستخدم في data/wa-sessions/u<ID>. المدير (index.js) يمرّر دوال قاعدة البيانات ودالة الذكاء.
const fs = require('fs');
const path = require('path');

const PAIR_TTL_MS = 3 * 60 * 1000;     // مهلة إدخال الكود في واتساب
const CODE_WAIT_MS = 25 * 1000;        // أقصى انتظار لاستلام الكود من واتساب
const HISTORY_TTL_MS = 30 * 60 * 1000; // ذاكرة المحادثة لكل مرسل
const MAX_BACKOFF_MS = 60 * 1000;
const MAX_RETRIES = 8;
const STALE_MSG_SEC = 120;             // تجاهل الرسائل الأقدم من دقيقتين (بعد انقطاع الاتصال)

const fmtCode = c => String(c || '').replace(/[^A-Za-z0-9]/g, '').replace(/(.{4})(?=.)/g, '$1-');
const bare = jid => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

function unwrap(message) {
  let m = message;
  for (let i = 0; i < 5 && m; i++) {
    const inner = (m.ephemeralMessage && m.ephemeralMessage.message)
      || (m.viewOnceMessage && m.viewOnceMessage.message)
      || (m.viewOnceMessageV2 && m.viewOnceMessageV2.message)
      || (m.documentWithCaptionMessage && m.documentWithCaptionMessage.message)
      || (m.editedMessage && m.editedMessage.message && m.editedMessage.message.protocolMessage && m.editedMessage.message.protocolMessage.editedMessage);
    if (!inner) break;
    m = inner;
  }
  return m || {};
}
function textOf(message) {
  const m = unwrap(message);
  return String(m.conversation || (m.extendedTextMessage && m.extendedTextMessage.text) || '').trim();
}
function isPrivateJid(jid) {
  const j = String(jid || '');
  return j.endsWith('@s.whatsapp.net') || j.endsWith('@lid');
}

module.exports = function createWaLink(opts) {
  const { dataDir, run, get, all, aiReply, redact = s => s, maxSessions = 5, log = console, loadBaileys } = opts;
  const baseDir = path.join(dataDir, 'wa-sessions');
  fs.mkdirSync(baseDir, { recursive: true });
  const sessions = new Map(); // userId -> entry
  let B = null;

  const sessDir = uid => path.join(baseDir, 'u' + Number(uid));
  const wipeDir = uid => { try { fs.rmSync(sessDir(uid), { recursive: true, force: true }); } catch (_) {} };

  async function baileys() {
    if (B) return B;
    const mod = loadBaileys ? await loadBaileys() : await import('@itsliaaa/baileys');
    const pick = n => mod[n] !== undefined ? mod[n] : (mod.default && mod.default[n]);
    B = {
      makeWASocket: pick('makeWASocket') || (typeof mod.default === 'function' ? mod.default : null),
      useMultiFileAuthState: pick('useMultiFileAuthState'),
      fetchLatestBaileysVersion: pick('fetchLatestBaileysVersion'),
      makeCacheableSignalKeyStore: pick('makeCacheableSignalKeyStore'),
      DisconnectReason: pick('DisconnectReason') || {},
    };
    if (!B.makeWASocket || !B.useMultiFileAuthState) throw new Error('BAILEYS_MISSING');
    return B;
  }
  async function makeLogger() {
    if (opts.logger) return opts.logger;
    const pino = (await import('pino')).default;
    return pino({ level: 'silent' });
  }

  function clearTimers(e) { clearTimeout(e.pairTimer); clearTimeout(e.retryTimer); }
  function closeSock(e) {
    try { e.sock && e.sock.ev && e.sock.ev.removeAllListeners && e.sock.ev.removeAllListeners(); } catch (_) {}
    try { e.sock && e.sock.end && e.sock.end(undefined); } catch (_) {}
    e.sock = null;
  }
  async function destroy(uid, { wipe = true, dropRow = true } = {}) {
    const e = sessions.get(uid);
    if (e) { e.stopped = true; clearTimers(e); closeSock(e); sessions.delete(uid); }
    if (wipe) wipeDir(uid);
    if (dropRow) await run('DELETE FROM wa_sessions WHERE user_id=?', [uid]).catch(() => {});
  }

  async function startSocket(uid, e) {
    const b = await baileys();
    const dir = sessDir(uid);
    fs.mkdirSync(dir, { recursive: true });
    const { state, saveCreds } = await b.useMultiFileAuthState(dir);
    const logger = await makeLogger();
    let version;
    try { version = (await b.fetchLatestBaileysVersion()).version; } catch (_) {}
    const sock = b.makeWASocket({
      logger,
      printQRInTerminal: false,
      browser: ['Windows', 'Chrome', '120.0.0.0'],
      auth: { creds: state.creds, keys: b.makeCacheableSignalKeyStore ? b.makeCacheableSignalKeyStore(state.keys, logger) : state.keys },
      markOnlineOnConnect: false,
      syncFullHistory: false,
      ...(version ? { version } : {}),
    });
    e.sock = sock;
    e.state = state.creds.registered ? 'connecting' : 'starting';

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', u => onConnection(uid, e, sock, state, u).catch(err => log.error('wa conn:', err.message)));
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const m of messages || []) onMessage(uid, e, sock, m);
    });
  }

  async function onConnection(uid, e, sock, state, u) {
    if (e.stopped || e.sock !== sock) return;
    const { connection, lastDisconnect, qr } = u;
    const DR = (B && B.DisconnectReason) || {};

    if (qr && !state.creds.registered && !e.codeRequested) {
      e.codeRequested = true;
      try {
        const raw = await sock.requestPairingCode(e.phone);
        e.code = fmtCode(raw);
        e.codeAt = Date.now();
        e.state = 'code';
        if (e.codeDeferred) e.codeDeferred.resolve(e.code);
      } catch (err) {
        e.codeRequested = false;
        if (e.codeDeferred) e.codeDeferred.reject(err);
      }
    }

    if (connection === 'open') {
      e.state = 'open';
      e.code = '';
      e.retries = 0;
      clearTimeout(e.pairTimer);
      const phone = bare(sock.user && sock.user.id);
      if (phone) { e.phone = phone; await run('UPDATE wa_sessions SET phone=? WHERE user_id=?', [phone, uid]).catch(() => {}); }
      log.log(`[WA] user ${uid} متصل`);
    }

    if (connection === 'close') {
      const status = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
      const loggedOut = status === (DR.loggedOut !== undefined ? DR.loggedOut : 401);
      const restart = status === (DR.restartRequired !== undefined ? DR.restartRequired : 515);
      closeSock(e);
      if (loggedOut) { log.log(`[WA] user ${uid} فُكّ الربط من الهاتف`); return destroy(uid); }
      if (!state.creds.registered && !restart) {
        // فشل أثناء الاقتران: لا نعيد المحاولة تلقائياً، يطلب المستخدم كوداً جديداً
        if (e.codeDeferred) e.codeDeferred.reject(new Error('PAIR_CLOSED'));
        e.state = 'failed';
        return destroy(uid);
      }
      if (e.stopped) return;
      if (restart) return startSocket(uid, e).catch(err => log.error('wa restart:', err.message)); // يحدث مباشرة بعد نجاح الاقتران
      e.retries = (e.retries || 0) + 1;
      if (e.retries > MAX_RETRIES) { e.state = 'closed'; return; }
      e.state = 'connecting';
      const delay = Math.min(MAX_BACKOFF_MS, 2000 * 2 ** e.retries);
      e.retryTimer = setTimeout(() => { if (!e.stopped) startSocket(uid, e).catch(err => { log.error('wa retry:', err.message); e.state = 'closed'; }); }, delay);
    }
  }

  // ===== الردّ الآلي =====
  function pruneHistory(e) {
    if (e.history.size < 150) return;
    const now = Date.now();
    for (const [k, v] of e.history) if (now - v.t > HISTORY_TTL_MS) e.history.delete(k);
    while (e.history.size > 150) e.history.delete(e.history.keys().next().value);
  }
  function allow(map, key, limit, windowMs) {
    const now = Date.now();
    const r = map.get(key) || { t: now, n: 0 };
    if (now - r.t > windowMs) { r.t = now; r.n = 0; }
    r.n++; map.set(key, r);
    return r.n <= limit;
  }
  function onMessage(uid, e, sock, m) {
    try {
      if (!m || !m.message || !m.key || m.key.fromMe) return;
      const jid = m.key.remoteJid;
      if (!isPrivateJid(jid) || m.key.participant) return;           // الخاص فقط، لا مجموعات ولا حالات ولا قنوات
      if (!e.aiEnabled) return;
      const ts = Number(m.messageTimestamp && m.messageTimestamp.low !== undefined ? m.messageTimestamp.low : m.messageTimestamp) || 0;
      if (ts && Date.now() / 1000 - ts > STALE_MSG_SEC) return;
      const text = textOf(m.message).slice(0, 2000);
      if (!text) return;
      if (!allow(e.rates, jid, 8, 60e3) || !allow(e.rates, '*', 40, 60e3)) return;
      if (e.pending >= 15) return;
      e.pending++;
      e.chain = e.chain.then(() => reply(e, sock, jid, text)).catch(err => log.error('wa reply:', err.message)).finally(() => { e.pending--; });
    } catch (err) { log.error('wa msg:', err.message); }
  }
  async function reply(e, sock, jid, text) {
    if (e.stopped || e.sock !== sock) return;
    const h = e.history.get(jid) || { t: 0, msgs: [] };
    if (Date.now() - h.t > HISTORY_TTL_MS) h.msgs = [];
    h.msgs.push({ role: 'user', content: redact(text) });
    h.msgs = h.msgs.slice(-8);
    h.t = Date.now();
    e.history.set(jid, h); pruneHistory(e);
    try { await sock.sendPresenceUpdate('composing', jid); } catch (_) {}
    let out = '';
    try { out = await aiReply({ ownerName: e.ownerName, messages: h.msgs }); }
    catch (err) { log.error('wa ai:', err.message); return; } // الصمت أفضل من إرسال رسالة خطأ لشخص غريب
    out = String(out || '').trim().slice(0, 3500);
    if (!out) return;
    h.msgs.push({ role: 'assistant', content: out });
    h.msgs = h.msgs.slice(-8);
    await sock.sendMessage(jid, { text: out });
    try { await sock.sendPresenceUpdate('paused', jid); } catch (_) {}
  }

  // ===== واجهة المدير =====
  function newEntry(phone, ownerName, aiEnabled) {
    return { sock: null, state: 'starting', phone, ownerName: ownerName || '', code: '', codeAt: 0, codeRequested: false, codeDeferred: null,
      retries: 0, stopped: false, aiEnabled: aiEnabled !== false, history: new Map(), rates: new Map(), chain: Promise.resolve(), pending: 0 };
  }
  const err = (code, msg) => Object.assign(new Error(msg), { code });

  async function pair(uid, phone, ownerName) {
    phone = String(phone || '').replace(/\D/g, '');
    if (phone.length < 8 || phone.length > 15) throw err('BAD_PHONE', 'الرقم غير صالح');
    const cur = sessions.get(uid);
    if (cur && cur.state === 'open') throw err('LINKED', 'حسابك مرتبط بالفعل. فُكّ الربط أولاً.');
    if (cur && cur.state === 'code' && cur.phone === phone && Date.now() - cur.codeAt < 90e3) return { code: cur.code };
    const taken = await get('SELECT user_id FROM wa_sessions WHERE phone=? AND user_id<>?', [phone, uid]);
    if (taken) throw err('PHONE_TAKEN', 'هذا الرقم مرتبط بحساب آخر.');
    if (!cur && sessions.size >= maxSessions) throw err('FULL', 'الخدمة ممتلئة حالياً، حاول لاحقاً.');
    await destroy(uid, { dropRow: false });
    await run('INSERT INTO wa_sessions(user_id,phone,ai_enabled) VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone, ai_enabled=1, created_at=CURRENT_TIMESTAMP', [uid, phone]);
    const e = newEntry(phone, ownerName, true);
    let resolve, reject;
    e.codeDeferred = new Promise((a, b) => { resolve = a; reject = b; });
    e.codeDeferred.resolve = resolve; e.codeDeferred.reject = reject;
    const waitP = e.codeDeferred;
    waitP.catch(() => {});
    sessions.set(uid, e);
    e.pairTimer = setTimeout(() => { if (e.state !== 'open') destroy(uid); }, PAIR_TTL_MS);
    try {
      await startSocket(uid, e);
      const code = await Promise.race([waitP, new Promise((_, rej) => setTimeout(() => rej(err('TIMEOUT', 'تعذر الحصول على الكود من واتساب')), CODE_WAIT_MS))]);
      return { code };
    } catch (ex) {
      await destroy(uid);
      if (ex.code) throw ex;
      log.error('wa pair:', ex.message);
      throw err('FAILED', ex.message === 'BAILEYS_MISSING' ? 'مكتبة واتساب غير مثبتة على الخادم.' : 'تعذر بدء الربط. تأكد من الرقم وحاول مجدداً.');
    }
  }

  function status(uid) {
    const e = sessions.get(uid);
    if (!e) return { state: 'none' };
    const left = e.state === 'code' ? Math.max(0, Math.round((PAIR_TTL_MS - (Date.now() - (e.codeAt || Date.now()))) / 1000)) : 0;
    return { state: e.state, phone: e.phone || '', code: e.state === 'code' ? e.code : '', expiresIn: left, aiEnabled: e.aiEnabled };
  }

  async function unlink(uid) {
    const e = sessions.get(uid);
    if (e && e.sock && e.state === 'open') { try { await Promise.race([e.sock.logout(), new Promise(r => setTimeout(r, 5000))]); } catch (_) {} }
    await destroy(uid);
  }

  async function setAi(uid, on) {
    await run('UPDATE wa_sessions SET ai_enabled=? WHERE user_id=?', [on ? 1 : 0, uid]);
    const e = sessions.get(uid);
    if (e) e.aiEnabled = !!on;
  }

  async function restoreAll() {
    const rows = await all('SELECT s.user_id, s.ai_enabled, u.name FROM wa_sessions s JOIN users u ON u.id=s.user_id WHERE u.disabled=0');
    let n = 0;
    for (const r of rows) {
      if (sessions.size >= maxSessions) break;
      const credsFile = path.join(sessDir(r.user_id), 'creds.json');
      let registered = false;
      try { registered = !!JSON.parse(fs.readFileSync(credsFile, 'utf8')).registered; } catch (_) {}
      if (!registered) { await destroy(r.user_id); continue; } // اقتران لم يكتمل قبل إعادة التشغيل
      const e = newEntry('', r.name, r.ai_enabled !== 0);
      const row = await get('SELECT phone FROM wa_sessions WHERE user_id=?', [r.user_id]);
      e.phone = row ? row.phone : '';
      e.state = 'connecting';
      sessions.set(r.user_id, e);
      setTimeout(() => { if (!e.stopped) startSocket(r.user_id, e).catch(x => { log.error('wa restore:', x.message); e.state = 'closed'; }); }, 2500 * n++);
    }
    return n;
  }

  function shutdown() { for (const [uid, e] of sessions) { e.stopped = true; clearTimers(e); closeSock(e); } sessions.clear(); }

  return { pair, status, unlink, setAi, restoreAll, shutdown, _sessions: sessions };
};
