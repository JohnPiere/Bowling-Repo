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

/**
 * How far notifications actually reach on this install.
 *
 * Two different things wear the word "notifications" and only one of them
 * needs a server:
 *
 * - **`alerts`** — permission granted, and the app raises notifications itself
 *   through the service worker while it is running. No server, no keys, works
 *   on GitHub Pages today.
 * - **`push`** — the browser's push service wakes the worker when the app is
 *   *closed*. That needs somebody holding a VAPID private key to send with,
 *   and a static site has nobody.
 *
 * Telling them apart is the whole of this file's job, because conflating them
 * is what was broken: the toggle asked for a push subscription, could not get
 * one, and reported failure — so the alerts that would have worked were never
 * switched on either.
 */
export type NotifyReach = 'none' | 'alerts' | 'push';

/**
 * Server that holds subscriptions and sends notifications.
 *
 * `/api` is the Vite dev proxy pointing at `server/index.mjs`. On GitHub Pages
 * nothing is there, which is why every call below treats its absence as an
 * ordinary answer rather than an error.
 */
const PUSH_API = import.meta.env.VITE_PUSH_API_URL ?? '/api';

/**
 * Is there a push server to talk to at all?
 *
 * A build for a static host has no VAPID key compiled in and no `/api` behind
 * it. Asking is pointless and, worse, *slow and noisy*: `vapidPublicKey()`
 * would fetch a 404 and throw, which is exactly how "turn on notifications"
 * came to do nothing at all.
 */
export function pushConfigured(): boolean {
  return Boolean(import.meta.env.VITE_VAPID_PUBLIC_KEY || import.meta.env.VITE_PUSH_API_URL);
}

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
export async function subscribeToPush(): Promise<NotifyReach> {
  const availability = pushAvailability();
  if (availability.state !== 'ready') throw new Error(availability.reason);

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'none';

  // Permission alone is worth having and is the part that always works. It is
  // returned before anything else can throw, because the previous version
  // asked the push service first: on a build with no server that threw, the
  // whole call failed, and somebody who had just granted permission was told
  // notifications could not be turned on.
  if (!pushConfigured()) return 'alerts';

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        // Safari supports visible notifications only; a silent push is dropped.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(await vapidPublicKey()),
      }));

    await rememberPushSubscription(subscription);
    await sendSubscriptionToServer(subscription);
    return 'push';
  } catch {
    // The push half is the half that can be missing. Alerts are already on.
    return 'alerts';
  }
}

/** What this install is currently getting. */
export async function currentReach(): Promise<NotifyReach> {
  if (pushAvailability().state !== 'ready') return 'none';
  if (Notification.permission !== 'granted') return 'none';
  if (!pushConfigured()) return 'alerts';

  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) ? 'push' : 'alerts';
}

/**
 * Raise a notification from the app itself.
 *
 * This is the whole of what works without a server, and it is not nothing: an
 * app on a phone stays open in the background for a long time, and a crew
 * chatting while two of them have Lane Log on screen is exactly the case.
 *
 * Silent about failure by design — a notification that could not be shown must
 * never break the thing it was announcing.
 */
export async function alert(message: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<boolean> {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(message.title, {
      body: message.body,
      icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
      badge: `${import.meta.env.BASE_URL}icons/badge-72.png`,
      // Tagged so a chatty crew replaces its own notification rather than
      // stacking eleven of them.
      tag: message.tag ?? 'lane-log',
      data: { url: message.url ?? import.meta.env.BASE_URL },
    });
    return true;
  } catch {
    return false;
  }
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
    icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
    badge: `${import.meta.env.BASE_URL}icons/badge-72.png`,
    tag: 'lane-log-test',
  });
}

export { storedPushSubscription };
