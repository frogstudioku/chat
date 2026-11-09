// Server chat internal. Jalankan di 1 PC/server kantor: npm run server
// Batasi domain email: set ALLOWED_DOMAIN=perusahaan.com
const express = require('express'), http = require('http'), { Server } = require('socket.io');
const multer = require('multer'), bcrypt = require('bcryptjs'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const nodemailer = require('nodemailer');
const BASE = process.pkg ? path.dirname(process.execPath) : __dirname; // folder .exe (mode tanpa Node.js)
try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(BASE, 'config.json'), 'utf8')))) process.env[k] = String(v); } catch (e) {
  if (e.code !== 'ENOENT') console.log('PERINGATAN config.json tidak valid (cek koma/tanda kutip): ' + e.message);
  else try { fs.writeFileSync(path.join(BASE, 'config.json'), JSON.stringify({ _catatan: 'Isi SMTP_* agar kode reset password terkirim ke email, simpan, lalu jalankan ulang server.', PORT: 3000, ALLOWED_DOMAIN: '', SMTP_HOST: '', SMTP_PORT: 465, SMTP_USER: '', SMTP_PASS: '', SMTP_FROM: '' }, null, 2)); console.log('config.json contoh dibuat di ' + BASE + ' - isi pengaturan SMTP di dalamnya.'); } catch (e2) {}
} // config.json opsional
const PORT = process.env.PORT || 3000, DOMAIN = (process.env.ALLOWED_DOMAIN || '').toLowerCase();
const DATA = path.join(BASE, 'data'); fs.mkdirSync(DATA + '/files', { recursive: true });
const DBF = DATA + '/db.json';
const db = fs.existsSync(DBF) ? JSON.parse(fs.readFileSync(DBF)) : { users: {}, msgs: [], tokens: {}, files: {} };
const save = () => fs.writeFileSync(DBF, JSON.stringify(db));
let mailer = null;
function makeMailer() { mailer = process.env.SMTP_HOST ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || 465), secure: (process.env.SMTP_PORT || 465) == 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, tls: process.env.SMTP_ALLOW_SELF_SIGNED === 'true' ? { rejectUnauthorized: false } : undefined }) : null; }
makeMailer();
async function sendCode(to, code) {
  if (!mailer) return console.log('[DEV] SMTP belum diatur. Kode reset untuk ' + to + ': ' + code);
  await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject: 'Kode reset password TeamChat', text: 'Kode reset password Anda: ' + code + '\nBerlaku 10 menit. Abaikan email ini jika Anda tidak memintanya.' });
}
const sha = x => crypto.createHash('sha256').update(String(x)).digest('hex');
db.resets = db.resets || {};
const app = express(), server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 1e6 });
// ===== Bot uji coba: @frogbot (otomatis jadi kontak semua user) =====
const BOT = 'frogbot';
if (!db.users[BOT]) { db.users[BOT] = { username: BOT, email: 'bot@chatfrog.local', hash: '!', contacts: [] }; save(); }
function botSay(to, text, file) {
  const m = { id: crypto.randomUUID(), from: BOT, to, text, file: file || null, ts: Date.now() };
  db.msgs.push(m); save(); io.to(to).emit('msg', m);
}
const HELP = 'Halo, saya Frog Bot 🐸 untuk uji coba. Yang bisa dicoba:\n• Kirim teks apa saja: saya balas\n• Kirim file (📎): saya terima dan kirim balik\n• /file : saya kirim file contoh untuk diunduh\n• /spam : 3 balasan beruntun (tes real-time)\n• /time : jam server\n• /ping : tes koneksi';
function botReply(user, m) {
  const t = (m.text || '').trim().toLowerCase();
  setTimeout(() => {
    if (m.file) return botSay(user, '✅ File diterima: ' + m.file.name + ' (' + Math.max(1, Math.round(m.file.size / 1024)) + ' KB). Saya kirim balik, coba unduh untuk memastikan file utuh.', m.file);
    if (t === '/ping') return botSay(user, 'pong 🐸 koneksi real-time berfungsi.');
    if (t === '/time') return botSay(user, 'Jam server: ' + new Date().toLocaleString('id-ID'));
    if (t === '/spam') return [1, 2, 3].forEach(i => setTimeout(() => botSay(user, 'Pesan beruntun ' + i + ' dari 3'), i * 400));
    if (t === '/file') {
      const id = crypto.randomBytes(16).toString('hex'), body = 'Ini file contoh dari Frog Bot.\nDibuat: ' + new Date().toISOString() + '\n';
      fs.writeFileSync(path.join(DATA, 'files', id), body); db.files[id] = 'contoh-dari-bot.txt'; save();
      return botSay(user, 'Ini file contoh. Coba klik untuk mengunduh.', { id, name: 'contoh-dari-bot.txt', size: Buffer.byteLength(body) });
    }
    if (t === '/help' || t === 'help' || t === 'halo' || t === 'hi') return botSay(user, HELP);
    botSay(user, 'Kamu bilang: "' + m.text + '" 🐸 Ketik /help untuk daftar perintah.');
  }, 600);
}
// ===================================================================

app.use((q, r, n) => { r.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }); q.method === 'OPTIONS' ? r.end() : n(); });
app.use(express.json());
const upload = multer({ dest: DATA + '/files', limits: { fileSize: 500 * 1024 * 1024 } });
const norm = s => String(s || '').trim().toLowerCase();
const auth = (q, r, n) => {
  const t = (q.headers.authorization || '').replace('Bearer ', '') || q.query.token;
  const u = db.tokens[t]; if (!u) return r.status(401).json({ error: 'Belum login' });
  q.user = db.users[u]; n();
};
app.post('/api/register', (q, r) => {
  const email = norm(q.body.email), username = norm(q.body.username), pw = String(q.body.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return r.status(400).json({ error: 'Email tidak valid' });
  if (DOMAIN && !email.endsWith('@' + DOMAIN)) return r.status(400).json({ error: 'Gunakan email kantor @' + DOMAIN });
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) return r.status(400).json({ error: 'Username 3-20 karakter (huruf, angka, _ .)' });
  if (pw.length < 6) return r.status(400).json({ error: 'Password minimal 6 karakter' });
  if (db.users[username]) return r.status(400).json({ error: 'Username "' + username + '" sudah dipakai. Coba username lain, atau masuk jika itu akun Anda.' });
  if (Object.values(db.users).some(u => u.email === email)) return r.status(400).json({ error: 'Email ini sudah terdaftar di akun lain. Masuk dengan username akun tersebut, atau pakai email lain.' });
  db.users[username] = { username, email, hash: bcrypt.hashSync(pw, 10), contacts: [] }; save();
  login(r, db.users[username]);
});
app.post('/api/login', (q, r) => {
  const u = db.users[norm(q.body.username)];
  if (!u || !bcrypt.compareSync(String(q.body.password || ''), u.hash)) return r.status(400).json({ error: 'Username atau password salah' });
  login(r, u);
});
app.post('/api/forgot', async (q, r) => {
  const u = db.users[norm(q.body.username)];
  if (u) {
    const old = db.resets[u.username];
    if (!(old && Date.now() - old.sent < 60000)) {
      const code = String(crypto.randomInt(100000, 1000000));
      db.resets[u.username] = { hash: sha(code), exp: Date.now() + 10 * 60000, tries: 0, sent: Date.now() }; save();
      try { await sendCode(u.email, code); } catch (e) { console.error('GAGAL kirim email ke ' + u.email + ': ' + e.message); console.log('[ADMIN] Kode reset untuk @' + u.username + ' (berikan manual jika perlu): ' + code); }
    }
  }
  r.json({ ok: true }); // respons sama agar username tidak bisa ditebak
});
app.post('/api/reset', (q, r) => {
  const u = db.users[norm(q.body.username)], x = u && db.resets[u.username], pw = String(q.body.password || '');
  if (pw.length < 6) return r.status(400).json({ error: 'Password minimal 6 karakter' });
  if (!x || Date.now() > x.exp || x.tries >= 5) return r.status(400).json({ error: 'Kode tidak valid atau kedaluwarsa. Minta kode baru.' });
  if (sha(String(q.body.code || '').trim()) !== x.hash) { x.tries++; save(); return r.status(400).json({ error: 'Kode salah' }); }
  u.hash = bcrypt.hashSync(pw, 10); delete db.resets[u.username];
  for (const t in db.tokens) if (db.tokens[t] === u.username) delete db.tokens[t]; // logout semua sesi lama
  save(); r.json({ ok: true });
});
function login(r, u) {
  const t = crypto.randomBytes(24).toString('hex'); db.tokens[t] = u.username;
  if (!u.contacts.includes(BOT)) u.contacts.unshift(BOT);
  if (!db.msgs.some(m => m.from === BOT && m.to === u.username)) db.msgs.push({ id: crypto.randomUUID(), from: BOT, to: u.username, text: HELP, file: null, ts: Date.now() });
  save(); r.json({ token: t, username: u.username, contacts: u.contacts });
}
app.get('/api/me', auth, (q, r) => { if (!q.user.contacts.includes(BOT)) { q.user.contacts.unshift(BOT); save(); } r.json({ username: q.user.username, contacts: q.user.contacts }); });
app.post('/api/logout', auth, (q, r) => { delete db.tokens[(q.headers.authorization || '').replace('Bearer ', '')]; save(); r.json({ ok: true }); });
app.post('/api/contacts', auth, (q, r) => {
  const n = norm(q.body.username);
  if (!db.users[n] || n === q.user.username) return r.status(404).json({ error: 'Username tidak ditemukan' });
  if (!q.user.contacts.includes(n)) { q.user.contacts.push(n); save(); }
  r.json({ contacts: q.user.contacts });
});
const IMG_OK = /^image\/(jpeg|png|webp|gif)$/;
const avUp = multer({ dest: DATA + '/files', limits: { fileSize: 2 * 1024 * 1024 } });
app.post('/api/avatar', auth, (q, r) => avUp.single('file')(q, r, err => {
  if (err) return r.status(400).json({ error: 'Foto terlalu besar (maks 2 MB)' });
  if (!q.file || !IMG_OK.test(q.file.mimetype)) { if (q.file) fs.unlink(q.file.path, () => {}); return r.status(400).json({ error: 'File harus berupa gambar (JPG/PNG/WebP)' }); }
  const u = q.user; if (u.avatar) fs.unlink(path.join(DATA, 'files', u.avatar.file), () => {});
  u.avatar = { file: q.file.filename, type: q.file.mimetype, v: Date.now() }; save();
  io.emit('profile', { username: u.username, v: u.avatar.v }); r.json({ v: u.avatar.v });
}));
app.post('/api/avatar/remove', auth, (q, r) => {
  const u = q.user; if (u.avatar) fs.unlink(path.join(DATA, 'files', u.avatar.file), () => {});
  u.avatar = null; save(); io.emit('profile', { username: u.username, v: 0 }); r.json({ ok: true });
});
app.get('/api/avatar/:u', auth, (q, r) => {
  const u = db.users[norm(q.params.u)]; if (!u || !u.avatar) return r.sendStatus(404);
  r.type(u.avatar.type); r.set('Cache-Control', 'private, max-age=86400');
  fs.createReadStream(path.join(DATA, 'files', path.basename(u.avatar.file))).pipe(r);
});
app.get('/api/profiles', auth, (q, r) => {
  const out = {}; [q.user.username, ...q.user.contacts].forEach(n => { const u = db.users[n]; if (u && u.avatar) out[n] = u.avatar.v; }); r.json(out);
});
app.post('/api/read', auth, (q, r) => { q.user.read = q.user.read || {}; q.user.read[norm(q.body.with)] = Date.now(); save(); r.json({ ok: true }); });
app.get('/api/unread', auth, (q, r) => {
  if (!q.user.read) { q.user.read = {}; q.user.contacts.forEach(c => q.user.read[c] = Date.now()); save(); } // pesan lama dianggap sudah dibaca
  const out = {}; db.msgs.forEach(m => { if (m.to === q.user.username && m.ts > (q.user.read[m.from] || 0)) out[m.from] = (out[m.from] || 0) + 1; });
  r.json(out);
});
app.get('/api/messages/:with', auth, (q, r) => {
  const a = q.user.username, b = q.params.with;
  r.json(db.msgs.filter(m => (m.from === a && m.to === b) || (m.from === b && m.to === a)));
});
app.post('/api/upload', auth, upload.single('file'), (q, r) => {
  const name = Buffer.from(q.file.originalname, 'latin1').toString('utf8');
  db.files[q.file.filename] = name; save();
  r.json({ id: q.file.filename, name, size: q.file.size });
});
app.get('/files/:id', auth, (q, r) => {
  const n = db.files[q.params.id]; if (!n) return r.sendStatus(404);
  r.download(path.join(DATA, 'files', path.basename(q.params.id)), n);
});
const SETUP_HTML = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Pengaturan Email - Chat Frog</title>
<style>body{font-family:Segoe UI,sans-serif;background:linear-gradient(150deg,#e8e3ff,#dcd3fb);display:flex;justify-content:center;padding:40px 16px;color:#2b2459;margin:0}
.c{background:#fff;border-radius:24px;padding:28px;width:430px;max-width:100%;box-shadow:0 12px 36px rgba(110,90,200,.2);display:flex;flex-direction:column;gap:10px;align-self:flex-start}
h2{margin:0}input,select{padding:11px 13px;border:1px solid #c9c0f5;border-radius:12px;font-size:14px}
button{padding:12px;border:0;border-radius:12px;background:#7b6af0;color:#fff;font-weight:600;cursor:pointer;font-size:14px}
.m{font-size:13px;min-height:18px}.ok{color:#1d8a3f}.er{color:#d6336c}small{color:#6f679c}hr{border:0;border-top:1px solid #e3defc;width:100%}</style>
<div class=c><h2>&#128056; Pengaturan Email Chat Frog</h2>
<small>Akun ini dipakai server untuk mengirim kode reset password. Cukup diisi sekali, tanpa perlu restart.</small><small><b>__STATUS__</b></small>
<select id=p><option value=gmail>Gmail</option><option value=o365>Office 365</option><option value=lain>Lainnya (data dari IT kantor)</option></select>
<input id=h placeholder="Server SMTP"><input id=pt placeholder="Port">
<input id=u placeholder="Email pengirim" type=email><input id=w placeholder="Password / App Password" type=password>
<small id=hint></small><button id=s>Simpan &amp; Tes Koneksi</button><div id=m class=m></div>
<hr><input id=to placeholder="Kirim email tes ke (alamat email Anda)" type=email><button id=t>Kirim Email Tes</button><div id=m2 class=m></div></div>
<script>
var P={gmail:['smtp.gmail.com',465,'Gmail: gunakan App Password (bukan password biasa). Verifikasi 2 langkah harus aktif.'],o365:['smtp.office365.com',587,'Office 365: SMTP AUTH harus diizinkan oleh admin IT.'],lain:['',587,'Isi server dan port sesuai data dari IT kantor.']};
function $(i){return document.getElementById(i)}
function pick(){var x=P[$('p').value];$('h').value=x[0];$('pt').value=x[1];$('hint').textContent=x[2]}
$('p').onchange=pick;pick();
function post(u,b,el){el.className='m';el.textContent='Memproses...';return fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(function(r){return r.json()}).then(function(j){el.className='m '+(j.ok?'ok':'er');el.textContent=j.ok?j.msg:j.error}).catch(function(e){el.className='m er';el.textContent='Gagal: '+e.message})}
$('s').onclick=function(){post('/setup/save',{host:$('h').value,port:$('pt').value,user:$('u').value,pass:$('w').value},$('m'))};
$('t').onclick=function(){post('/setup/test',{to:$('to').value},$('m2'))};
</script>`;
const OWN_IPS = [].concat(...Object.values(require('os').networkInterfaces())).map(i => i.address);
const isLocal = q => { const a = String(q.socket.remoteAddress || '').replace('::ffff:', ''); return a === '127.0.0.1' || a === '::1' || OWN_IPS.includes(a); };
app.get('/setup', (q, r) => isLocal(q) ? r.type('html').send(SETUP_HTML.replace('__STATUS__', mailer ? 'Status: email aktif (' + process.env.SMTP_HOST + ')' : 'Status: email belum diatur')) : r.status(403).send('Halaman ini hanya bisa dibuka dari PC server: http://localhost:' + PORT + '/setup'));
app.post('/setup/save', async (q, r) => {
  if (!isLocal(q)) return r.sendStatus(403);
  const b = q.body || {}; if (!b.host || !b.user || !b.pass) return r.json({ error: 'Server, email, dan password wajib diisi' });
  const f = path.join(BASE, 'config.json'); let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
  const user = String(b.user).trim(), host = String(b.host).trim();
  Object.assign(cfg, { SMTP_HOST: host, SMTP_PORT: +b.port || 465, SMTP_USER: user, SMTP_PASS: /gmail/i.test(host) ? String(b.pass).replace(/\s+/g, '') : String(b.pass), SMTP_FROM: 'Chat Frog <' + user + '>' });
  try { fs.writeFileSync(f, JSON.stringify(cfg, null, 2)); } catch (e) { return r.json({ error: 'Gagal menyimpan config.json: ' + e.message }); }
  for (const k of Object.keys(cfg)) process.env[k] = String(cfg[k]); makeMailer();
  try { await mailer.verify(); r.json({ ok: true, msg: 'Tersimpan dan koneksi email berhasil. Coba kirim email tes di bawah.' }); }
  catch (e) { r.json({ error: 'Tersimpan, tetapi koneksi gagal: ' + e.message }); }
});
app.post('/setup/test', async (q, r) => {
  if (!isLocal(q)) return r.sendStatus(403); if (!mailer) return r.json({ error: 'Simpan pengaturan dulu' });
  try { await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: String((q.body || {}).to || '').trim(), subject: 'Tes email Chat Frog', text: 'Berhasil! Email dari server Chat Frog berfungsi.' }); r.json({ ok: true, msg: 'Email tes terkirim. Cek inbox (dan folder Spam).' }); }
  catch (e) { r.json({ error: 'Gagal mengirim: ' + e.message }); }
});
app.get('/', (q, r) => r.type('html').send(fs.readFileSync(path.join(__dirname, 'index.html'))));
app.use((err, q, r, n) => r.status(400).json({ error: 'Gagal: ' + (err.code === 'LIMIT_FILE_SIZE' ? 'file terlalu besar (maks 500 MB)' : err.message) }));
io.use((s, n) => { const u = db.tokens[s.handshake.auth.token]; if (!u) return n(new Error('auth')); s.user = u; n(); });
io.on('connection', s => {
  s.join(s.user);
  s.on('send', ({ to, text, file }) => {
    to = norm(to); if (!db.users[to] || (!text && !file)) return;
    const m = { id: crypto.randomUUID(), from: s.user, to, text: String(text || '').slice(0, 5000), file: file || null, ts: Date.now() };
    db.msgs.push(m);
    [[s.user, to], [to, s.user]].forEach(([a, b]) => { const c = db.users[a].contacts; if (!c.includes(b)) c.push(b); });
    save(); io.to(s.user).to(to).emit('msg', m);
    if (to === BOT) botReply(s.user, m);
  });
});
server.listen(PORT, '0.0.0.0', () => {
  console.log('=== Chat Frog Server (c) 2026 Ari Fitriansyah. Jalan - jangan tutup jendela ini. ===');
  const ips = [].concat(...Object.values(require('os').networkInterfaces())).filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('Isi "Alamat server" di aplikasi dengan salah satu:'); ips.forEach(ip => console.log('   http://' + ip + ':' + PORT));
  console.log('Data tersimpan di: ' + DATA);
  console.log(fs.existsSync(path.join(BASE, 'config.json')) ? 'config.json: dimuat' : 'config.json: TIDAK ditemukan di ' + BASE);
  if (mailer) mailer.verify().then(() => console.log('Email (SMTP): OK - ' + process.env.SMTP_HOST), e => console.log('Email (SMTP): GAGAL - ' + e.message));
  else {
    console.log('Email (SMTP): belum diatur. Mengatur email: buka http://localhost:' + PORT + '/setup di PC ini.');
    if (process.pkg) { try { require('child_process').exec('start "" "http://localhost:' + PORT + '/setup"'); console.log('Membuka halaman pengaturan email di browser...'); } catch (e) {} }
  }
});
