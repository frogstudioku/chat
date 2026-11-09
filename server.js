// Server chat internal. Jalankan di 1 PC/server kantor: npm run server
// Batasi domain email: set ALLOWED_DOMAIN=perusahaan.com
const express = require('express'), http = require('http'), { Server } = require('socket.io');
const multer = require('multer'), bcrypt = require('bcryptjs'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const nodemailer = require('nodemailer');
const PORT = process.env.PORT || 3000, DOMAIN = (process.env.ALLOWED_DOMAIN || '').toLowerCase();
const DATA = path.join(__dirname, 'data'); fs.mkdirSync(DATA + '/files', { recursive: true });
const DBF = DATA + '/db.json';
const db = fs.existsSync(DBF) ? JSON.parse(fs.readFileSync(DBF)) : { users: {}, msgs: [], tokens: {}, files: {} };
const save = () => fs.writeFileSync(DBF, JSON.stringify(db));
const mailer = process.env.SMTP_HOST ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || 465), secure: (process.env.SMTP_PORT || 465) == 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }) : null;
async function sendCode(to, code) {
  if (!mailer) return console.log('[DEV] SMTP belum diatur. Kode reset untuk ' + to + ': ' + code);
  await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject: 'Kode reset password TeamChat', text: 'Kode reset password Anda: ' + code + '\nBerlaku 10 menit. Abaikan email ini jika Anda tidak memintanya.' });
}
const sha = x => crypto.createHash('sha256').update(String(x)).digest('hex');
db.resets = db.resets || {};
const app = express(), server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 1e6 });
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
  if (db.users[username] || Object.values(db.users).some(u => u.email === email)) return r.status(400).json({ error: 'Email/username sudah dipakai' });
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
      try { await sendCode(u.email, code); } catch (e) { console.error('Gagal kirim email:', e.message); }
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
function login(r, u) { const t = crypto.randomBytes(24).toString('hex'); db.tokens[t] = u.username; save(); r.json({ token: t, username: u.username, contacts: u.contacts }); }
app.post('/api/logout', auth, (q, r) => { delete db.tokens[(q.headers.authorization || '').replace('Bearer ', '')]; save(); r.json({ ok: true }); });
app.post('/api/contacts', auth, (q, r) => {
  const n = norm(q.body.username);
  if (!db.users[n] || n === q.user.username) return r.status(404).json({ error: 'Username tidak ditemukan' });
  if (!q.user.contacts.includes(n)) { q.user.contacts.push(n); save(); }
  r.json({ contacts: q.user.contacts });
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
app.get('/', (q, r) => r.sendFile(path.join(__dirname, 'index.html')));
io.use((s, n) => { const u = db.tokens[s.handshake.auth.token]; if (!u) return n(new Error('auth')); s.user = u; n(); });
io.on('connection', s => {
  s.join(s.user);
  s.on('send', ({ to, text, file }) => {
    to = norm(to); if (!db.users[to] || (!text && !file)) return;
    const m = { id: crypto.randomUUID(), from: s.user, to, text: String(text || '').slice(0, 5000), file: file || null, ts: Date.now() };
    db.msgs.push(m);
    [[s.user, to], [to, s.user]].forEach(([a, b]) => { const c = db.users[a].contacts; if (!c.includes(b)) c.push(b); });
    save(); io.to(s.user).to(to).emit('msg', m);
  });
});
server.listen(PORT, '0.0.0.0', () => console.log('TeamChat server jalan di port ' + PORT));
