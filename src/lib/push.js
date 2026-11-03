// Ativar / desativar notificações push neste dispositivo.
import { savePushSubscription, deletePushSubscription, DEMO } from './store.js';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY;

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

/**
 * 'on' | 'off' | 'denied' | 'install' (iPhone: tem de estar no ecrã principal) | 'unsupported'
 */
export async function pushStatus() {
  if (DEMO || !VAPID) return 'unsupported';
  if (isIOS() && !isStandalone()) return 'install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function keyBytes(b64url) {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Tem de ser chamado a partir de um toque do utilizador (regra do iOS). */
export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('As notificações não foram autorizadas.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) });
  const { endpoint, keys } = sub.toJSON();
  await savePushSubscription({ endpoint, p256dh: keys.p256dh, auth: keys.auth });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await deletePushSubscription(sub.endpoint);
  await sub.unsubscribe();
}
