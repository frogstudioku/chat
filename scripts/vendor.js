// Menyalin library socket.io client ke folder vendor/ agar ikut terbungkus di aplikasi (tidak bergantung pada server)
const fs = require('fs'), path = require('path');
const c = ['node_modules/socket.io-client/dist/socket.io.min.js', 'node_modules/socket.io/client-dist/socket.io.min.js', 'node_modules/socket.io/client-dist/socket.io.js'];
const f = c.find(x => fs.existsSync(x));
if (!f) { console.error('socket.io client tidak ditemukan. Jalankan npm install dulu.'); process.exit(1); }
fs.mkdirSync('vendor', { recursive: true });
fs.copyFileSync(f, 'vendor/socket.io.js');
console.log('vendor/socket.io.js dari ' + f);
