import express from 'express';
import multer from 'multer';
import GIFEncoder from 'gif-encoder-2';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PREVIEWS_DIR = path.join(UPLOADS_DIR, '.previews');
const PREVIEW_VERSION = 'v2';
const ALBUMS_FILE = path.join(DATA_DIR, 'albums.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(PREVIEWS_DIR, { recursive: true });

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

async function readPhotoBuffer(photo, baseUrl) {
  if (photo.startsWith('/')) {
    return fs.promises.readFile(path.join(__dirname, photo.replace(/^\/+/, '')));
  }

  const response = await fetch(new URL(photo, `${baseUrl}/`));
  if (!response.ok) {
    throw new Error(`Could not fetch photo: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function createAlbumGif(album, baseUrl) {
  const width = 540;
  const height = 675;
  const encoder = new GIFEncoder(width, height, 'neuquant', true, album.photos.length);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(1800);
  encoder.setQuality(10);

  for (const photo of album.photos.slice(0, 20)) {
    const { data } = await sharp(await readPhotoBuffer(photo, baseUrl))
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    encoder.addFrame({
      getImageData: () => ({ data }),
    });
  }

  encoder.finish();
  return encoder.out.getData();
}

async function getAlbumGif(album, baseUrl) {
  const previewPath = path.join(PREVIEWS_DIR, `${album.id}-${PREVIEW_VERSION}.gif`);

  try {
    return await fs.promises.readFile(previewPath);
  } catch (_error) {
    const gif = await createAlbumGif(album, baseUrl);
    await fs.promises.writeFile(previewPath, gif);
    return gif;
  }
}

async function invalidateAlbumGif(albumId) {
  try {
    await fs.promises.unlink(path.join(PREVIEWS_DIR, `${albumId}-${PREVIEW_VERSION}.gif`));
  } catch (_error) {
    // The preview may not exist yet.
  }
}

function getPublicBaseUrl(req) {
  const configuredUrl = process.env.PUBLIC_URL;
  const fallbackUrl = `${req.get('host') === 'localhost' ? 'http' : 'https'}://${req.get('host')}`;
  const rawUrl = configuredUrl || fallbackUrl;

  if (req.get('host') !== 'localhost') {
    return rawUrl.replace(/^http:\/\//i, 'https://').replace(/\/$/, '');
  }

  return rawUrl.replace(/\/$/, '');
}

function renderAlbumPage(album, req) {
  const baseUrl = getPublicBaseUrl(req);
  const toAbsoluteUrl = (photo) => new URL(photo, `${baseUrl}/`).toString();
  const cover = toAbsoluteUrl(album.photos[0] || 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=85');
  const photos = album.photos.map(toAbsoluteUrl);
  const safeTitle = escapeHtml(album.title);
  const previewVersion = req.query.v || album.updatedAt || album.createdAt || Date.now();
  const previewUrl = `${baseUrl}/album/${album.id}/preview.gif?v=${previewVersion}`;
  const brandName = '@xuan.atic';
  const safeDescription = escapeHtml(album.description || 'Shared photo album');
  const displayYear = String(album.date || '').match(/\d{4}/)?.[0] || '2006';
  const displayDate = `█ / █ / ${displayYear}`;
  const publicUrl = `${baseUrl}/album/${album.id}?v=${previewVersion}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${brandName}</title>
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${brandName}" />
    <meta property="og:image" content="${previewUrl}" />
    <meta property="og:image:type" content="image/gif" />
    <meta property="og:image:width" content="540" />
    <meta property="og:image:height" content="675" />
    <meta property="og:url" content="${publicUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${brandName}" />
    <meta name="twitter:image" content="${previewUrl}" />
    <style>
      body { font-family: Arial, sans-serif; background: #0f172a; color: #e5e7eb; margin: 0; }
      main { width: 100%; max-width: 500px; margin: 0 auto; padding: 18px 12px; }
      .album-shell { width: 100%; background: rgba(15,23,42,0.94); border: 1px solid rgba(148,163,184,0.25); border-radius: 10px; padding: 12px; box-shadow: 0 18px 44px rgba(2,8,23,.35); }
      .post-column { width: min(100%, 440px); margin: 0 auto; }
      .main-media { position: relative; width: 100%; aspect-ratio: 4 / 5; margin: 0; background: #020817; overflow: hidden; }
      .main-media img { width: 100%; height: 100%; object-fit: contain; display: block; }
      .eyebrow { color: #e5e7eb; font-weight: 800; text-align: left; margin: 0 0 10px; }
      .top-handle { margin: 0 0 10px; }
      .post-text { width: 100%; margin: 12px 0 0; line-height: 1.35; }
      .caption { color: #cbd5e1; margin: 0; text-align: left; font-size: .82rem; overflow-wrap: anywhere; }
      .caption strong { color: #e5e7eb; margin-right: 10px; }
      .date { color: #94a3b8; font-size: .7rem; margin: 8px 0 0; }
      .controls { position: absolute; inset: 0; pointer-events: none; }
      .controls button { position: absolute; top: 50%; transform: translateY(-50%); width: 42px; height: 42px; border: 1px solid rgba(255,255,255,.45); border-radius: 50%; background: rgba(15,23,42,.72); color: #fff; font-size: 28px; line-height: 1; cursor: pointer; pointer-events: auto; }
      #previous-photo { left: 12px; }
      #next-photo { right: 12px; }
    </style>
  </head>
  <body>
    <main>
      <div class="album-shell">
        <div class="post-column">
          <p class="eyebrow top-handle">${brandName}</p>

          <div class="main-media">
            <img src="${cover}" alt="${safeTitle}" />
            <div class="controls">
              <button type="button" id="previous-photo" aria-label="Previous photo">&#8249;</button>
              <button type="button" id="next-photo" aria-label="Next photo">&#8250;</button>
            </div>
          </div>

          <div class="post-text">
            <p class="caption"><strong>${brandName}</strong><span>${safeDescription}</span></p>
            <p class="date">${displayDate}</p>
          </div>
        </div>

      </div>
    </main>
    <script>
      const photos = ${JSON.stringify(photos).replace(/</g, '\\u003c')};
      let currentPhoto = 0;
      const image = document.querySelector('.main-media img');
      const showPhoto = (index) => {
        currentPhoto = (index + photos.length) % photos.length;
        image.src = photos[currentPhoto];
      };
      document.getElementById('previous-photo').addEventListener('click', () => showPhoto(currentPhoto - 1));
      document.getElementById('next-photo').addEventListener('click', () => showPhoto(currentPhoto + 1));
    </script>
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
    date: req.body.year || '2006',
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

app.post('/api/albums/:id/photos', upload.array('photos', 25), async (req, res) => {
  const albums = readAlbums();
  const album = albums.find((item) => item.id === req.params.id);

  if (!album) {
    return res.status(404).json({ message: 'Album not found.' });
  }

  const newPhotos = (req.files || []).map((file) => `/uploads/${file.filename}`);
  album.photos = [...album.photos, ...newPhotos];
  album.updatedAt = Date.now();
  writeAlbums(albums);
  await invalidateAlbumGif(album.id);
  res.json(album);
});

app.delete('/api/albums/:id', async (req, res) => {
  const albums = readAlbums();
  const remaining = albums.filter((item) => item.id !== req.params.id);
  writeAlbums(remaining);
  await invalidateAlbumGif(req.params.id);
  res.json({ ok: true });
});

app.get('/album/:id', (req, res) => {
  const albums = ensureSeedAlbum();
  const album = albums.find((item) => item.id === req.params.id);

  if (!album) {
    return res.status(404).send('<h1>Album not found</h1>');
  }

  res.send(renderAlbumPage(album, req));
});

app.get('/album/:id/preview.gif', async (req, res) => {
  const albums = ensureSeedAlbum();
  const album = albums.find((item) => item.id === req.params.id);

  if (!album || !album.photos.length) {
    return res.status(404).end();
  }

  try {
    const baseUrl = getPublicBaseUrl(req);
    const gif = await getAlbumGif(album, baseUrl);
    res.type('gif').set('Cache-Control', 'public, max-age=3600').send(gif);
  } catch (error) {
    console.error('Could not generate album preview:', error);
    res.status(500).end();
  }
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
