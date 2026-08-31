/**
 * Web Push subscription.
 *
 * iOS is the constraint that shapes this file. Safari has supported Web Push
 * since 16.4, but only for a PWA the user has actually added to the Home
 * Screen — in a normal Safari tab the Notification and PushManager APIs are
 * either missing or permanently denied. So capability detection here reports
 * *why* push is unavailable, because "add this to your Home Screen first" is
 * something the bowler can act on and "notifications unsupported" is not.
 */

import { rememberPushSubscription, forgetPushSubscription, storedPushSubscription } from './db';
import { isIos, isStandalone } from './platform';

export type PushAvailability =
  | { state: 'ready' }
  | { state: 'needs-install'; reason: string }
  | { state: 'unsupported'; reason: string };

export type PushStatus = 'subscribed' | 'unsubscribed' | 'denied' | 'unavailable';

/** Server that holds subscriptions and sends notifications. */
const PUSH_API = import.meta.env.VITE_PUSH_API_URL ?? '/api';

export function pushAvailability(): PushAvailability {
  if (!('serviceWorker' in navigator)) {
    return { state: 'unsupported', reason: 'This browser has no service worker support.' };
  }

  // On iOS the APIs simply are not there until the app is installed, so check
  // the platform before concluding the browser cannot do push at all.
  if (isIos() && !isStandalone()) {
    return {
      state: 'needs-install',
      reason:
        'On iPhone and iPad, notifications only work once Lane Log is added to the Home Screen.',
    };
  }

  if (!('Notification' in window)) {
    return { state: 'unsupported', reason: 'This browser cannot show notifications.' };
  }

  if (!('PushManager' in window)) {
    return { state: 'unsupported', reason: 'This browser has no Push API support.' };
  }

  return { state: 'ready' };
}

export async function currentPushStatus(): Promise<PushStatus> {
  if (pushAvailability().state !== 'ready') return 'unavailable';
  if (Notification.permission === 'denied') return 'denied';

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? 'subscribed' : 'unsubscribed';
}

/**
 * VAPID keys travel as base64url but the Push API wants raw bytes.
 *
 * Backed by an explicit ArrayBuffer: `applicationServerKey` will not accept a
 * view that might sit on a SharedArrayBuffer.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));

  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function vapidPublicKey(): Promise<string> {
  const configured = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (configured) return configured;

  // Falling back to the server keeps the key in one place for self-hosters who
  // would rather not rebuild the client to rotate it.
  const response = await fetch(`${PUSH_API}/vapid-public-key`);
  if (!response.ok) throw new Error('Could not fetch the push key from the server.');
  const { key } = await response.json();
  if (!key) throw new Error('The server did not return a push key.');
  return key;
}

/**
 * Ask for permission and subscribe this device.
 *
 * Must be called from a user gesture — Safari and Chrome both reject a
 * permission prompt that did not come from a tap.
 */
export async function subscribeToPush(): Promise<PushStatus> {
  const availability = pushAvailability();
  if (availability.state !== 'ready') throw new Error(availability.reason);

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return permission === 'denied' ? 'denied' : 'unsubscribed';
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await rememberPushSubscription(existing);
    await sendSubscriptionToServer(existing);
    return 'subscribed';
  }

  const subscription = await registration.pushManager.subscribe({
    // Safari supports visible notifications only; a silent push is dropped.
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(await vapidPublicKey()),
  });

  await rememberPushSubscription(subscription);
  await sendSubscriptionToServer(subscription);
  return 'subscribed';
}

export async function unsubscribeFromPush(): Promise<PushStatus> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    await fetch(`${PUSH_API}/unsubscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => {
      // The local unsubscribe is what matters; the server prunes dead
      // endpoints when a send fails.
    });
    await subscription.unsubscribe();
  }

  await forgetPushSubscription();
  return 'unsubscribed';
}

async function sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  const response = await fetch(`${PUSH_API}/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!response.ok) {
    throw new Error('Saved on this device, but the server would not accept the subscription.');
  }
}

/**
 * Fire a notification through the service worker without involving the server.
 * Useful for checking that permission actually works on a given handset.
 */
export async function showLocalTestNotification(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification('Lane Log', {
    body: 'Notifications are working on this device.',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: 'lane-log-test',
  });
}

export { storedPushSubscription };
