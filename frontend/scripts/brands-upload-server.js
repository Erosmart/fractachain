const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.BRANDS_UPLOAD_PORT || 3333);
const BRANDS_DIR = path.join(__dirname, '..', 'public', 'brands');
const ENV_FILE = path.join(__dirname, '..', '.env.local');

const SLOTS = [
  { slug: 'cnv', label: 'CNV' },
  { slug: 'caja-de-valores', label: 'Caja de Valores' },
  { slug: 'byma', label: 'BYMA' },
  { slug: 'stellar', label: 'Stellar' },
  { slug: 'alfred-pay', label: 'Alfred Pay' },
  { slug: 'matba-rofex', label: 'Matba Rofex' },
  { slug: 'anclap', label: 'Anclap' },
  { slug: 'circle', label: 'Circle CCTP' },
  { slug: 'scf', label: 'Stellar Community Fund' },
  { slug: 'gafi', label: 'GAFI' },
  { slug: 'ypfd', label: 'YPF' },
  { slug: 'ggal', label: 'Galicia' },
  { slug: 'pamp', label: 'Pampa Energía' },
  { slug: 'bma', label: 'Banco Macro' },
  { slug: 'teco2', label: 'Telecom' },
  { slug: 'txar', label: 'Ternium' },
  { slug: 'vist', label: 'Vista Energy' },
  { slug: 'tgsu2', label: 'TGS' },
  { slug: 'cepu', label: 'Central Puerto' },
  { slug: 'alua', label: 'Aluar' },
  { slug: 'cres', label: 'Cresud' },
];

fs.mkdirSync(BRANDS_DIR, { recursive: true });

function firebaseStatus() {
  try {
    if (!fs.existsSync(ENV_FILE)) return { ok: false, hint: 'Todavía no hay .env.local' };
    const raw = fs.readFileSync(ENV_FILE, 'utf8');
    const key = (raw.match(/^NEXT_PUBLIC_FIREBASE_API_KEY=(.+)$/m) || [])[1] || '';
    const domain = (raw.match(/^NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=(.+)$/m) || [])[1] || '';
    const ok = Boolean(key && key !== 'mock_firebase_api_key_fractachain' && domain);
    return { ok, hint: ok ? `Google listo · ${domain}` : 'Faltan claves de Firebase' };
  } catch {
    return { ok: false, hint: 'No pude leer .env.local' };
  }
}

function parseFirebasePaste(text) {
  const src = String(text || '').trim();
  if (!src) throw new Error('Pegá el firebaseConfig o las líneas NEXT_PUBLIC_FIREBASE_*');
  const out = {};
  const map = {
    apiKey: 'NEXT_PUBLIC_FIREBASE_API_KEY',
    authDomain: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    projectId: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    storageBucket: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    messagingSenderId: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    appId: 'NEXT_PUBLIC_FIREBASE_APP_ID',
    measurementId: 'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
  };
  for (const line of src.split(/\r?\n/)) {
    const env = line.match(/^\s*(NEXT_PUBLIC_FIREBASE_[A-Z0-9_]+)\s*=\s*(.*)$/);
    if (env) {
      out[env[1]] = env[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  for (const [field, envName] of Object.entries(map)) {
    const re = new RegExp(`${field}\\s*[:=]\\s*["'\`]([^"'\`]+)["'\`]`, 'i');
    const m = src.match(re);
    if (m) out[envName] = m[1].trim();
  }
  const need = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
  ];
  const missing = need.filter((k) => !out[k]);
  if (missing.length) throw new Error('No encontré: ' + missing.join(', '));
  return out;
}

function mergeEnvLocal(updates) {
  let existing = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  if (!existing.includes('NEXT_PUBLIC_API_URL=')) {
    existing = `NEXT_PUBLIC_API_URL=http://localhost:4000\n${existing}`;
  }
  const pending = { ...updates };
  const lines = existing.split(/\r?\n/).map((line) => {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (m && pending[m[1]] != null) {
      const next = `${m[1]}=${pending[m[1]]}`;
      delete pending[m[1]];
      return next;
    }
    return line;
  });
  for (const [k, v] of Object.entries(pending)) lines.push(`${k}=${v}`);
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n');
  fs.writeFileSync(ENV_FILE, text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function existingMap() {
  const out = {};
  for (const s of SLOTS) {
    const p = path.join(BRANDS_DIR, `${s.slug}.png`);
    out[s.slug] = fs.existsSync(p);
  }
  return out;
}

function page() {
  const have = existingMap();
  const cards = SLOTS.map((s) => {
    const ok = have[s.slug];
    return `<article class="slot" data-slug="${s.slug}">
      <div class="drop">
        <div class="preview">${ok ? `<img src="/file/${s.slug}.png?t=${Date.now()}" alt="" />` : '<span>Arrastrá el PNG acá</span>'}</div>
        <strong>${s.label}</strong>
      </div>
      <form method="post" action="/upload" enctype="multipart/form-data" onsubmit="return false">
        <input type="hidden" name="slug" value="${s.slug}" />
        <input name="logo" type="file" accept="image/png,image/*,.png" />
        <button type="button" class="pick">${ok ? 'Reemplazar' : 'Elegir archivo'}</button>
      </form>
    </article>`;
  }).join('');

  const fb = firebaseStatus();
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Logos y claves Firebase</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #f7faf5; color: #111; padding: 20px; }
    h1 { font-size: 1.35rem; margin: 0 0 6px; }
    h2 { font-size: 1.05rem; margin: 0 0 8px; }
    p { color: #555; margin: 0 0 18px; line-height: 1.45; }
    .fb { background: #fff; border: 1px solid #1112; border-radius: 18px; padding: 16px; margin-bottom: 22px; }
    .fb textarea { width: 100%; min-height: 180px; border: 1px solid #1112; border-radius: 12px; padding: 12px; font-family: ui-monospace, monospace; font-size: 12px; resize: vertical; }
    .fb .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 10px; }
    .status { font-size: 13px; font-weight: 700; }
    .ok { color: #2f6f28; }
    .no { color: #9a3b16; }
    .msg { font-size: 13px; color: #333; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
    .slot { background: #fff; border: 1px dashed #1114; border-radius: 16px; padding: 12px; display: flex; flex-direction: column; gap: 8px; transition: border-color .15s, background .15s; }
    .slot.over { border-color: #2f6f28; background: #eaf7e6; }
    .drop { cursor: copy; }
    .preview { height: 72px; display: grid; place-items: center; background: #f3f6f1; border-radius: 10px; overflow: hidden; color: #777; font-size: 12px; text-align: center; padding: 6px; }
    .preview img { max-height: 56px; max-width: 90%; object-fit: contain; }
    strong { font-size: 13px; }
    input[type=file] { width: 100%; font-size: 12px; }
    button { width: 100%; border: 0; background: #111; color: #fff; font-weight: 700; padding: 10px; border-radius: 10px; }
    .fb button { width: auto; padding: 10px 16px; }
  </style>
</head>
<body>
  <section class="fb">
    <h1>Claves de Google / Firebase</h1>
    <p>Pegá acá el bloque <code>firebaseConfig</code> de la consola (o las líneas <code>NEXT_PUBLIC_FIREBASE_*</code>). Se guarda en <code>frontend/.env.local</code>. Después reiniciá el frontend en :3000.</p>
    <p class="status ${fb.ok ? 'ok' : 'no'}">${fb.hint}</p>
    <textarea id="fbtext" placeholder='const firebaseConfig = {\n  apiKey: "...",\n  authDomain: "...",\n  projectId: "...",\n  storageBucket: "...",\n  messagingSenderId: "...",\n  appId: "..."\n};'></textarea>
    <div class="row">
      <button type="button" id="fbsave">Guardar claves</button>
      <span class="msg" id="fbmsg"></span>
    </div>
  </section>
  <h2>Logos de marcas e instituciones</h2>
  <p>Arrastrá el PNG encima de cada marca, o elegilo a mano. Después recargá Fractachain en :3000.</p>
  <div class="grid">${cards}</div>
  <script>
    async function send(slug, file) {
      const data = new FormData();
      data.append('slug', slug);
      data.append('logo', file, file.name || slug + '.png');
      const res = await fetch('/upload', { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t);
      }
      location.reload();
    }
    document.getElementById('fbsave').addEventListener('click', async () => {
      const msg = document.getElementById('fbmsg');
      msg.textContent = 'Guardando…';
      try {
        const res = await fetch('/firebase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ text: document.getElementById('fbtext').value }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'No se pudo guardar');
        msg.textContent = json.message;
        setTimeout(() => location.reload(), 700);
      } catch (err) {
        msg.textContent = err.message;
      }
    });
    document.querySelectorAll('.slot').forEach((slot) => {
      const slug = slot.dataset.slug;
      ['dragenter', 'dragover'].forEach((ev) => {
        slot.addEventListener(ev, (e) => { e.preventDefault(); slot.classList.add('over'); });
      });
      ['dragleave', 'drop'].forEach((ev) => {
        slot.addEventListener(ev, () => slot.classList.remove('over'));
      });
      slot.addEventListener('drop', async (e) => {
        e.preventDefault();
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        try { await send(slug, file); } catch (err) { alert(err.message); }
      });
      const input = slot.querySelector('input[type=file]');
      const pick = slot.querySelector('.pick');
      pick.addEventListener('click', () => input.click());
      input.addEventListener('change', async () => {
        if (!input.files || !input.files[0]) return;
        try { await send(slug, input.files[0]); } catch (err) { alert(err.message); }
      });
    });
  </script>
</body>
</html>`;
}

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
      let slug = '';
      let file = null;
      let start = buf.indexOf(boundary);
      while (start !== -1) {
        const next = buf.indexOf(boundary, start + boundary.length);
        if (next === -1) break;
        const part = buf.slice(start + boundary.length, next);
        start = next;
        const split = part.indexOf('\r\n\r\n');
        if (split === -1) continue;
        const header = part.slice(0, split).toString('utf8');
        let body = part.slice(split + 4);
        if (body.slice(-2).toString() === '\r\n') body = body.slice(0, -2);
        if (/name="slug"/i.test(header) && !/filename=/i.test(header)) {
          slug = body.toString('utf8').trim();
        }
        if (/name="logo"/i.test(header)) {
          file = { filename: (header.match(/filename="([^"]+)"/i) || [])[1] || 'logo.png', body };
        }
      }
      if (!file) return reject(new Error('Falta el archivo'));
      resolve({ slug, file });
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page());
    return;
  }
  if (req.method === 'GET' && url.pathname.startsWith('/file/')) {
    const slug = path.basename(url.pathname.replace('/file/', '')).replace(/\.png$/i, '');
    const dest = path.join(BRANDS_DIR, `${slug}.png`);
    if (!SLOTS.some((s) => s.slug === slug) || !fs.existsSync(dest)) {
      res.writeHead(404);
      res.end('missing');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'image/png' });
    fs.createReadStream(dest).pipe(res);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/firebase') {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw.toString('utf8') || '{}');
      const updates = parseFirebasePaste(payload.text);
      mergeEnvLocal(updates);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        message: 'Claves guardadas. Reiniciá npm run dev del frontend para que Google funcione.',
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: err.message }));
    }
    return;
  }
  if (req.method === 'POST' && url.pathname === '/upload') {
    try {
      const { slug, file } = await parseMultipart(req);
      if (!SLOTS.some((s) => s.slug === slug)) throw new Error('Marca desconocida');
      fs.writeFileSync(path.join(BRANDS_DIR, `${slug}.png`), file.body);
      if ((req.headers.accept || '').includes('application/json')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, slug }));
        return;
      }
      res.writeHead(302, { Location: '/' });
      res.end();
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
  const nets = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
    }
  }
  console.log(`Brands upload on http://0.0.0.0:${PORT}`);
  for (const ip of ips) console.log(`LAN: http://${ip}:${PORT}`);
});
