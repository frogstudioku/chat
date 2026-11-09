CARA PAKAI
1. Install Node.js (nodejs.org), lalu di folder ini: npm install
2. SERVER (1 PC kantor yang selalu menyala):
   set ALLOWED_DOMAIN=perusahaan.com   (opsional, batasi email kantor)
   npm run server
   Buka port 3000 di Windows Firewall.
3. COBA APLIKASI: npm run app
4. BUAT INSTALLER .EXE: npm run build  -> hasil di folder dist/
   Bagikan installer ke tim, isi "Alamat server" = http://IP-SERVER:3000

LUPA PASSWORD (kirim kode via email) - atur SMTP di server sebelum npm run server:
   set SMTP_HOST=smtp.gmail.com
   set SMTP_PORT=465
   set SMTP_USER=akun@perusahaan.com
   set SMTP_PASS=app-password
   set SMTP_FROM=TeamChat <akun@perusahaan.com>
Tanpa SMTP, kode reset hanya tampil di jendela server (mode uji).
Login memakai USERNAME + password. Email hanya untuk reset password.

BOT UJI COBA: akun @frogbot otomatis ada di daftar chat. Kirim teks, file, atau /help, /file, /spam, /time, /ping untuk menguji semua fitur sebelum menambah user lain.

DIAGNOSA EMAIL: saat server dijalankan, jendela server menampilkan "Email (SMTP): OK" atau "GAGAL - alasan".
Jika email gagal terkirim, kode reset tetap tampil di jendela server ([ADMIN]) agar bisa diberikan manual.
Untuk server email dengan sertifikat internal, tambahkan "SMTP_ALLOW_SELF_SIGNED": "true" di config.json.
