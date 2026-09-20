const STORAGE_KEY = 'album-studio-data';
const albumForm = document.getElementById('album-form');
const albumTitleInput = document.getElementById('album-title');
const albumDescriptionInput = document.getElementById('album-description');
const albumPhotosInput = document.getElementById('album-photos');
const addMorePhotosInput = document.getElementById('add-more-photos');
const albumList = document.getElementById('album-list');
const albumListTemplate = document.getElementById('album-item-template');
const emptyState = document.getElementById('empty-state');
const albumView = document.getElementById('album-view');
const albumNameNode = document.getElementById('album-name');
const albumDescriptionDisplay = document.getElementById('album-description-display');
const albumKicker = document.getElementById('album-kicker');
const shareButton = document.getElementById('share-btn');
const deleteButton = document.getElementById('delete-btn');
const mainImage = document.getElementById('main-image');
const thumbStrip = document.getElementById('thumb-strip');
const prevPhotoButton = document.getElementById('prev-photo');
const nextPhotoButton = document.getElementById('next-photo');

const shareTitle = document.getElementById('share-title');
const shareDescription = document.getElementById('share-description');
const shareMainImage = document.getElementById('share-main-image');
const shareThumbStrip = document.getElementById('share-thumb-strip');
const sharePrevButton = document.getElementById('share-prev');
const shareNextButton = document.getElementById('share-next');
const sharePageContainer = document.getElementById('share-page-container');
const shareEmpty = document.getElementById('share-empty');

let albums = [];
let selectedAlbumId = null;
let activePhotoIndex = 0;

initializeApp();

async function initializeApp() {
  albums = await loadAlbums();

  if (!albums.length) {
    albums = getDefaultAlbums();
    persistAlbums();
  }

  renderAlbums();
  restoreFocusFromHash();
  setupSharePage();
}

albumForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const title = albumTitleInput.value.trim();
  const description = albumDescriptionInput.value.trim();
  const files = [...albumPhotosInput.files || []];

  if (!title) {
    albumTitleInput.focus();
    return;
  }

  const photoData = await readFilesAsDataUrls(files);

  const newAlbum = {
    id: createSlug(title),
    title,
    description,
    photos: photoData,
    createdAt: Date.now(),
  };

  albums = [newAlbum, ...albums];
  persistAlbums();
  renderAlbums();
  selectAlbum(newAlbum.id);
  albumForm.reset();
});

shareButton.addEventListener('click', async () => {
  const album = albums.find((item) => item.id === selectedAlbumId);
  if (!album) return;

  const shareUrl = getAlbumShareUrl(album.id, 'share.html');

  try {
    await navigator.clipboard.writeText(shareUrl);
    shareButton.textContent = 'Link copied';
    setTimeout(() => {
      shareButton.textContent = 'Copy share link';
    }, 1500);
  } catch (error) {
    window.prompt('Copy this album URL:', shareUrl);
  }
});

deleteButton.addEventListener('click', () => {
  if (!selectedAlbumId) return;

  const confirmation = window.confirm('Delete this album and all of its photos?');
  if (!confirmation) return;

  albums = albums.filter((album) => album.id !== selectedAlbumId);
  persistAlbums();

  if (albums.length === 0) {
    selectedAlbumId = null;
    updateHash();
    renderAlbums();
    return;
  }

  selectedAlbumId = albums[0].id;
  renderAlbums();
  selectAlbum(selectedAlbumId);
});

addMorePhotosInput.addEventListener('change', async (event) => {
  const album = albums.find((entry) => entry.id === selectedAlbumId);
  if (!album) return;

  const files = [...event.target.files || []];
  if (!files.length) return;

  album.photos = [...album.photos, ...(await readFilesAsDataUrls(files))];
  persistAlbums();
  renderAlbums();
  selectAlbum(album.id);
  addMorePhotosInput.value = '';
});

prevPhotoButton.addEventListener('click', () => {
  if (!selectedAlbumId) return;
  const album = getSelectedAlbum();
  if (!album?.photos.length) return;

  activePhotoIndex = (activePhotoIndex - 1 + album.photos.length) % album.photos.length;
  renderActivePhoto();
});

nextPhotoButton.addEventListener('click', () => {
  if (!selectedAlbumId) return;
  const album = getSelectedAlbum();
  if (!album?.photos.length) return;

  activePhotoIndex = (activePhotoIndex + 1) % album.photos.length;
  renderActivePhoto();
});

async function loadAlbums() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed;
      }
    }
  } catch (_error) {
    // Ignore invalid local cache and fall back to public album JSON.
  }

  try {
    const response = await fetch('/data/albums.json', { cache: 'no-store' });
    if (!response.ok) return [];

    const parsed = await response.json();
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_error) {
    // Public album data may not exist in a static local preview.
  }

  return [];
}

function persistAlbums() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(albums));
  } catch (_error) {
    // Ignore storage errors in private browsing or restricted contexts.
  }
}

function renderAlbums() {
  albumList.innerHTML = '';

  if (!albums.length) {
    emptyState.classList.remove('hidden');
    albumView.classList.add('hidden');
    selectedAlbumId = null;
    return;
  }

  albums.forEach((album) => {
    const itemNode = albumListTemplate.content.firstElementChild.cloneNode(true);
    const button = itemNode.querySelector('.album-item-button');
    const name = itemNode.querySelector('.album-item-name');
    const meta = itemNode.querySelector('.album-item-meta');

    name.textContent = album.title;
    meta.textContent = `${album.photos?.length || 0} image${album.photos?.length === 1 ? '' : 's'}`;

    button.classList.toggle('active', album.id === selectedAlbumId);
    button.addEventListener('click', () => selectAlbum(album.id));
    albumList.appendChild(itemNode);
  });
}

function selectAlbum(albumId) {
  const album = albums.find((entry) => entry.id === albumId);
  if (!album) return;

  selectedAlbumId = albumId;
  activePhotoIndex = 0;
  renderAlbums();
  updateHash();
  updateSocialMeta(album);

  emptyState.classList.add('hidden');
  albumView.classList.remove('hidden');

  albumKicker.textContent = 'Album';
  albumNameNode.textContent = album.title;
  albumDescriptionDisplay.textContent = album.description || 'No description added.';

  if (!album.photos.length) {
    mainImage.src = '';
    mainImage.alt = 'No photos in album yet';
    thumbStrip.innerHTML = '';
    return;
  }

  renderActivePhoto();
}

function renderActivePhoto() {
  const album = getSelectedAlbum();
  if (!album || !album.photos.length) return;

  const photo = album.photos[activePhotoIndex];
  mainImage.src = photo;
  mainImage.alt = `${album.title} photo ${activePhotoIndex + 1}`;

  thumbStrip.innerHTML = album.photos
    .map((src, index) => {
      return `
        <button type="button" class="thumb-button ${index === activePhotoIndex ? 'active' : ''}" data-index="${index}" aria-label="View photo ${index + 1}">
          <img src="${src}" alt="Thumbnail ${index + 1}" />
        </button>
      `;
    })
    .join('');

  thumbStrip.querySelectorAll('.thumb-button').forEach((button) => {
    button.addEventListener('click', () => {
      activePhotoIndex = Number(button.dataset.index);
      renderActivePhoto();
    });
  });
}

function getSelectedAlbum() {
  return albums.find((entry) => entry.id === selectedAlbumId) || null;
}

function updateHash() {
  const url = new URL(window.location.href);

  if (selectedAlbumId) {
    url.searchParams.set('album', selectedAlbumId);
  } else {
    url.searchParams.delete('album');
  }

  url.hash = '';
  window.history.replaceState(null, '', url.toString());
}

function restoreFocusFromHash() {
  const queryParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const albumId = queryParams.get('album') || hashParams.get('album');

  if (!albums.length) return;

  const match = albums.find((entry) => entry.id === albumId);
  if (match) {
    selectAlbum(match.id);
    return;
  }

  selectAlbum(albums[0].id);
}

function getAlbumShareUrl(albumId, page = 'index.html') {
  const url = new URL(window.location.href);
  url.pathname = page;
  url.search = `?album=${encodeURIComponent(albumId)}`;
  url.hash = '';
  return url.toString();
}

function updateSocialMeta(album) {
  const firstImage = album?.photos?.[0] || '';
  const title = album ? `${album.title} | Album Studio` : 'Album Studio';
  const description = album?.description || 'Create and share photo albums with a scrollable slideshow.';

  document.title = title;

  setMetaTag('meta[property="og:title"]', title);
  setMetaTag('meta[property="og:description"]', description);
  setMetaTag('meta[property="og:image"]', firstImage);
  setMetaTag('meta[property="og:url"]', getAlbumShareUrl(album?.id || '', 'share.html'));
  setMetaTag('meta[name="twitter:title"]', title);
  setMetaTag('meta[name="twitter:description"]', description);
  setMetaTag('meta[name="twitter:image"]', firstImage);
}

function setMetaTag(selector, content) {
  if (!content) return;

  let element = document.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    const isProperty = selector.includes('property');
    const attributeName = selector.match(/(?:property|name)="([^"]+)"/)[1];
    element.setAttribute(isProperty ? 'property' : 'name', attributeName);
    document.head.appendChild(element);
  }

  element.setAttribute('content', content);
}

function setupSharePage() {
  const isSharePage = document.body.dataset.page === 'share';
  if (!isSharePage) return;

  const params = new URLSearchParams(window.location.search);
  const albumId = params.get('album');
  const album = albums.find((item) => item.id === albumId);

  if (!album) {
    sharePageContainer.classList.add('hidden');
    shareEmpty.classList.remove('hidden');
    return;
  }

  shareTitle.textContent = album.title;
  shareDescription.textContent = album.description || 'No description added.';

  const firstImage = album.photos[0];
  document.title = `${album.title} | Album Studio`;

  setMetaTag('meta[property="og:title"]', `${album.title} | Album Studio`);
  setMetaTag('meta[property="og:description"]', album.description || 'Shared photo album');
  setMetaTag('meta[property="og:image"]', firstImage);
  setMetaTag('meta[property="og:url"]', window.location.href);
  setMetaTag('meta[name="twitter:title"]', `${album.title} | Album Studio`);
  setMetaTag('meta[name="twitter:description"]', album.description || 'Shared photo album');
  setMetaTag('meta[name="twitter:image"]', firstImage);

  let shareIndex = 0;

  function renderSharePhoto() {
    const item = album.photos[shareIndex];
    shareMainImage.src = item;
    shareMainImage.alt = `${album.title} photo ${shareIndex + 1}`;

    shareThumbStrip.innerHTML = album.photos
      .map((src, index) => {
        return `
          <button type="button" class="thumb-button ${index === shareIndex ? 'active' : ''}" data-index="${index}" aria-label="View photo ${index + 1}">
            <img src="${src}" alt="Thumbnail ${index + 1}" />
          </button>
        `;
      })
      .join('');

    shareThumbStrip.querySelectorAll('.thumb-button').forEach((button) => {
      button.addEventListener('click', () => {
        shareIndex = Number(button.dataset.index);
        renderSharePhoto();
      });
    });
  }

  sharePrevButton.addEventListener('click', () => {
    shareIndex = (shareIndex - 1 + album.photos.length) % album.photos.length;
    renderSharePhoto();
  });

  shareNextButton.addEventListener('click', () => {
    shareIndex = (shareIndex + 1) % album.photos.length;
    renderSharePhoto();
  });

  shareEmpty.classList.add('hidden');
  sharePageContainer.classList.remove('hidden');
  renderSharePhoto();
}

function readFilesAsDataUrls(files) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          if (!file.type.startsWith('image/')) {
            resolve(null);
            return;
          }

          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target.result);
          reader.onerror = () => reject(new Error('Failed to read image file'));
          reader.readAsDataURL(file);
        })
    )
  ).then((results) => results.filter(Boolean));
}

function createSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'album';
}

function getDefaultAlbums() {
  return [
    {
      id: 'sample-summer-trip',
      title: 'Summer trip',
      description: 'Warm sunsets and road trip memories.',
      photos: [
        'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80',
      ],
      createdAt: Date.now(),
    },
  ];
}

function seedDefaultAlbums() {
  if (albums.length) return;

  albums = getDefaultAlbums();
  persistAlbums();
  selectedAlbumId = albums[0].id;
}
