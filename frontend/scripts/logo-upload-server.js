const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.LOGO_UPLOAD_PORT || 3333);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const PAGE = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Subir logo Fractachain</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100dvh; display: grid; place-items: center;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background: #fff; color: #111; padding: 24px;
    }
    .card {
      width: min(420px, 100%);
      border: 1px solid #1113; border-radius: 24px; padding: 28px;
      box-shadow: 0 20px 50px -24px #3a6a2a55;
    }
    h1 { font-size: 1.4rem; margin: 0 0 8px; }
    p { color: #555; margin: 0 0 20px; line-height: 1.4; }
    input[type=file] { width: 100%; margin: 12px 0 20px; }
    button {
      width: 100%; border: 0; background: #111; color: #fff;
      font-weight: 700; padding: 16px; border-radius: 14px; font-size: 1rem;
    }
    .ok { color: #1a6b2a; font-weight: 700; }
    .err { color: #8a1f1f; font-weight: 700; }
  </style>
</head>
<body>
  <form class="card" method="post" action="/upload" enctype="multipart/form-data">
    <h1>Logo Fractachain</h1>
    <p>Elegí una foto o un archivo PNG / JPG / WEBP / SVG desde el iPhone.</p>
    <input name="logo" type="file" accept="image/*,.svg" required />
    <button type="submit">Subir logo</button>
  </form>
</body>
</html>`;

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const ctype = req.headers['content-type'] || '';
      const m = ctype.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
      if (!m) return reject(new Error('No boundary'));
      const boundary = Buffer.from('--' + (m[1] || m[2]).trim());
      const parts = [];
      let start = buf.indexOf(boundary);
      while (start !== -1) {
        const next = buf.indexOf(boundary, start + boundary.length);
        if (next === -1) break;
        parts.push(buf.slice(start + boundary.length, next));
        start = next;
      }
      for (const part of parts) {
        const split = part.indexOf('\r\n\r\n');
        if (split === -1) continue;
        const header = part.slice(0, split).toString('utf8');
        if (!/name="logo"/i.test(header)) continue;
        let body = part.slice(split + 4);
        if (body.slice(-2).toString() === '\r\n') body = body.slice(0, -2);
        const fn = (header.match(/filename="([^"]+)"/i) || [])[1] || 'logo.png';
        resolve({ filename: fn, body });
        return;
      }
      reject(new Error('No se encontró el archivo logo'));
    });
    req.on('error', reject);
  });
}

function extOf(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.heic'].includes(ext)) return ext === '.jpeg' ? '.jpg' : ext;
  return '.png';
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
    return;
  }
  if (req.method === 'POST' && req.url === '/upload') {
    try {
      const file = await parseMultipart(req);
      const ext = extOf(file.filename);
      const dest = path.join(PUBLIC_DIR, 'logo' + ext);
      for (const leftover of ['.png', '.jpg', '.webp', '.svg', '.gif', '.heic']) {
        const p = path.join(PUBLIC_DIR, 'logo' + leftover);
        if (p !== dest && fs.existsSync(p)) fs.unlinkSync(p);
      }
      fs.writeFileSync(dest, file.body);
      fs.writeFileSync(path.join(PUBLIC_DIR, '.logo-ext'), ext);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><meta name="viewport" content="width=device-width, initial-scale=1" />
        <body style="font-family:sans-serif;padding:32px;text-align:center">
        <p class="ok" style="color:#1a6b2a;font-weight:700">Listo. Logo guardado como logo${ext}.</p>
        <p>Volvé a Fractachain y recargá la página.</p>
        <p><a href="/">Subir otro</a></p></body>`);
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Error: ' + err.message);
    }
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Logo upload on http://0.0.0.0:${PORT}`);
});
