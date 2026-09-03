/**
 * Telling somebody their crew did something.
 *
 * This is the half of "notifications" that works without a server, and it is
 * worth being exact about what that means. The browser's push service can wake
 * a closed app, and doing so needs somebody holding a VAPID private key to
 * send with — a static site has nobody, so that half cannot work here at all.
 * What *can* work is the app raising a notification itself, off the Realtime
 * subscription it already keeps, whenever it is running. On a phone an
 * installed app stays running in the background for a long time, so this is
 * most of the value and none of the infrastructure.
 *
 * Two rules decide whether anything is shown, and both are about not being
 * annoying:
 *
 *  - **Never for your own doing.** Your own message arriving back down the
 *    socket is not news.
 *  - **Never for what is already on screen.** Being notified about the message
 *    you are reading, in the chat you are looking at, is the app talking over
 *    itself.
 */

import { alert } from './push';

/** What the app is looking at, so alerting can stay out of its way. */
export interface AlertContext {
  /** The crew whose chat is open, if one is. */
  openChatGroupId: string | null;
  /** The crew whose board is open, if one is. */
  openBoardGroupId: string | null;
  /** False when the app is in the background, where everything is news. */
  visible: boolean;
}

export interface CrewAlert {
  groupId: string;
  groupName: string;
  authorId: string;
  kind: 'message' | 'game';
  /** The message, or the score that was posted. */
  detail: string;
}

/**
 * Should this be shown, and as what?
 *
 * Pure, and separated from the socket on purpose: every rule here is a
 * judgement about when to interrupt somebody, and those are the ones worth
 * being able to state as tests rather than discover on a phone.
 */
export function alertFor(
  event: CrewAlert,
  me: string,
  context: AlertContext,
): { title: string; body: string; tag: string } | null {
  if (event.authorId === me) return null;

  // Whatever is on screen is already telling them. When the app is in the
  // background nothing is on screen, so nothing is exempt.
  if (context.visible) {
    if (event.kind === 'message' && context.openChatGroupId === event.groupId) return null;
    if (event.kind === 'game' && context.openBoardGroupId === event.groupId) return null;
  }

  return {
    title: event.groupName,
    body: event.detail,
    // One notification per crew per kind: a crew mid-conversation replaces its
    // own rather than stacking eleven of them down the shade.
    tag: `lane-log-${event.kind}-${event.groupId}`,
  };
}

/** Show it, if it should be shown. Returns whether anything was raised. */
export async function raise(
  event: CrewAlert,
  me: string,
  context: AlertContext,
): Promise<boolean> {
  const message = alertFor(event, me, context);
  if (!message) return false;
  return alert(message);
}
