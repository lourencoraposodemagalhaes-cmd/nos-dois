// Fotos: redimensionar antes de enviar e obter endereços para as mostrar.
import { useEffect, useState } from 'preact/hooks';
import { uploadFile, signedUrls, insert, myId } from './store.js';
import { today } from './dates.js';

const MAX = 1600; // px no lado maior: chega para o ecrã e poupa espaço

/** Reduz a foto para JPEG (~200–400 KB). */
export async function shrink(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('Não foi possível ler a foto.'))), 'image/jpeg', 0.82));
}

export async function postPhoto(file, { kind = 'daily', date = today(), caption = null, late = false } = {}) {
  const blob = await shrink(file);
  const path = `${date}/${myId()}-${Date.now()}.jpg`;
  await uploadFile(path, blob);
  return insert('photos', { kind, date, path, caption, late });
}

// Cache de endereços assinados (válidos 1 h; renovamos aos 50 min).
const cache = new Map();
const pending = new Map();

async function urlFor(path) {
  const hit = cache.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  if (!pending.has(path)) {
    pending.set(path, signedUrls([path]).then((m) => {
      cache.set(path, { url: m[path], until: Date.now() + 50 * 60000 });
      pending.delete(path);
      return m[path];
    }).catch((e) => { pending.delete(path); throw e; }));
  }
  return pending.get(path);
}

/** Pré-carrega vários de uma vez (álbum). */
export async function preload(paths) {
  const missing = paths.filter((p) => !(cache.get(p)?.until > Date.now()));
  if (!missing.length) return;
  const m = await signedUrls(missing);
  for (const p of missing) cache.set(p, { url: m[p], until: Date.now() + 50 * 60000 });
}

export function usePhotoUrl(path) {
  const [url, setUrl] = useState(() => (cache.get(path)?.until > Date.now() ? cache.get(path).url : null));
  useEffect(() => {
    let alive = true;
    if (path) urlFor(path).then((u) => alive && setUrl(u)).catch(() => {});
    return () => { alive = false; };
  }, [path]);
  return url;
}
