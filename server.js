import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const ALBUMS_FILE = path.join(DATA_DIR, 'albums.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const base = file.originalname
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-z0-9-_]+/gi, '-')
      .toLowerCase();
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const upload = multer({ storage });

function readAlbums() {
  try {
    const raw = fs.readFileSync(ALBUMS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function writeAlbums(albums) {
  fs.writeFileSync(ALBUMS_FILE, JSON.stringify(albums, null, 2));
}

function ensureSeedAlbum() {
  const albums = readAlbums();
  if (albums.length > 0) return albums;

  const seed = [{
    id: 'sample-summer-trip',
    title: 'Summer trip',
    description: 'Warm sunsets and road trip memories.',
    photos: [
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80',
    ],
    createdAt: Date.now(),
  }];

  writeAlbums(seed);
  return seed;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'album';
}

function renderAlbumPage(album) {
  const cover = album.photos[0] || 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80';
  const safeTitle = escapeHtml(album.title);
  const safeDescription = escapeHtml(album.description || 'Shared photo album');
  const publicUrl = `${process.env.PUBLIC_URL || `http://localhost:${PORT}`}/album/${album.id}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle} | Album Studio</title>
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${safeTitle} | Album Studio" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:image" content="${cover}" />
    <meta property="og:url" content="${publicUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle} | Album Studio" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${cover}" />
    <style>
      body { font-family: Arial, sans-serif; background: #0f172a; color: #e5e7eb; margin: 0; }
      main { max-width: 1100px; margin: 0 auto; padding: 40px 20px; }
      .album-shell { background: rgba(15,23,42,0.8); border: 1px solid rgba(148,163,184,0.25); border-radius: 24px; padding: 20px; }
      .main-media { background: #020817; border-radius: 18px; overflow: hidden; }
      .main-media img { width: 100%; height: 70vh; object-fit: contain; display: block; }
      .thumb-row { display: flex; gap: 12px; overflow-x: auto; margin-top: 16px; }
      .thumb-row img { width: 130px; height: 90px; object-fit: cover; border-radius: 12px; border: 2px solid transparent; }
      .title { font-size: clamp(1.8rem, 2vw, 2.5rem); margin: 0 0 8px; }
      .description { color: #cbd5e1; margin-bottom: 16px; }
    </style>
  </head>
  <body>
    <main>
      <div class="album-shell">
        <p style="color:#60a5fa; text-transform: uppercase; letter-spacing: 0.14em; font-size: 11px; margin-bottom: 8px;">Shared album</p>
        <h1 class="title">${safeTitle}</h1>
        <p class="description">${safeDescription}</p>

        <div class="main-media">
          <img src="${cover}" alt="${safeTitle}" />
        </div>

        <div class="thumb-row">
          ${album.photos.map((photo, index) => `<img src="${photo}" alt="${safeTitle} photo ${index + 1}" />`).join('')}
        </div>
      </div>
    </main>
  </body>
</html>`;
}

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/data', express.static(DATA_DIR));
app.use(express.static(__dirname));

app.get('/api/albums', (_req, res) => {
  const albums = ensureSeedAlbum();
  res.json(albums);
});

app.post('/api/albums', upload.array('photos', 25), (req, res) => {
  const { title, description } = req.body;
  const photos = (req.files || []).map((file) => `/uploads/${file.filename}`);

  if (!title || !title.trim()) {
    return res.status(400).json({ message: 'Album title is required.' });
  }

  const album = {
    id: slugify(title),
    title: title.trim(),
    description: description ? description.trim() : '',
    photos,
    createdAt: Date.now(),
  };

  const albums = readAlbums();
  const existing = albums.find((item) => item.id === album.id);
  if (existing) {
    album.id = `${album.id}-${Date.now()}`;
  }

  const allAlbums = [album, ...albums];
  writeAlbums(allAlbums);
  res.status(201).json(album);
});

app.post('/api/albums/:id/photos', upload.array('photos', 25), (req, res) => {
  const albums = readAlbums();
  const album = albums.find((item) => item.id === req.params.id);

  if (!album) {
    return res.status(404).json({ message: 'Album not found.' });
  }

  const newPhotos = (req.files || []).map((file) => `/uploads/${file.filename}`);
  album.photos = [...album.photos, ...newPhotos];
  writeAlbums(albums);
  res.json(album);
});

app.delete('/api/albums/:id', (req, res) => {
  const albums = readAlbums();
  const remaining = albums.filter((item) => item.id !== req.params.id);
  writeAlbums(remaining);
  res.json({ ok: true });
});

app.get('/album/:id', (req, res) => {
  const albums = ensureSeedAlbum();
  const album = albums.find((item) => item.id === req.params.id);

  if (!album) {
    return res.status(404).send('<h1>Album not found</h1>');
  }

  res.send(renderAlbumPage(album));
});

app.get('/share.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'share.html'));
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Album server running at http://localhost:${PORT}`);
});
