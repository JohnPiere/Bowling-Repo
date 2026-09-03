import { describe, expect, it } from 'vitest';
import { alertFor, type AlertContext, type CrewAlert } from '../src/lib/alerts';

/**
 * When to interrupt somebody.
 *
 * Every rule here is a judgement about that, which is exactly why it is a pure
 * function rather than three conditions buried in a socket callback: getting
 * one wrong means an app that talks over itself, and the only way that shows
 * up otherwise is somebody turning notifications off for good.
 */

const CHAT: CrewAlert = {
  groupId: 'g1',
  groupName: 'Tuesday Crew',
  authorId: 'kenji',
  kind: 'message',
  detail: 'Anyone free Thursday?',
};

const GAME: CrewAlert = { ...CHAT, kind: 'game', detail: 'Kenji posted a 234' };

const LOOKING_AT_NOTHING: AlertContext = {
  openChatGroupId: null,
  openBoardGroupId: null,
  visible: true,
};

describe('alertFor', () => {
  it('announces a crew message', () => {
    const shown = alertFor(CHAT, 'me', LOOKING_AT_NOTHING);
    expect(shown?.title).toBe('Tuesday Crew');
    expect(shown?.body).toBe('Anyone free Thursday?');
  });

  it('says nothing about your own message', () => {
    // Your own message arriving back down the socket is not news.
    expect(alertFor(CHAT, 'kenji', LOOKING_AT_NOTHING)).toBeNull();
  });

  it('says nothing about the chat you are reading', () => {
    // Being notified about the message on the screen in front of you is the
    // app talking over itself.
    expect(
      alertFor(CHAT, 'me', { ...LOOKING_AT_NOTHING, openChatGroupId: 'g1' }),
    ).toBeNull();
  });

  it('still announces another crew while you read this one', () => {
    expect(
      alertFor({ ...CHAT, groupId: 'g2' }, 'me', { ...LOOKING_AT_NOTHING, openChatGroupId: 'g1' }),
    ).not.toBeNull();
  });

  it('announces a shared game while you are in the chat, not the board', () => {
    // Different screens, different news. The chat does not show the board.
    expect(alertFor(GAME, 'me', { ...LOOKING_AT_NOTHING, openChatGroupId: 'g1' })).not.toBeNull();
    expect(alertFor(GAME, 'me', { ...LOOKING_AT_NOTHING, openBoardGroupId: 'g1' })).toBeNull();
  });

  it('announces everything once the app is in the background', () => {
    // Nothing is on screen, so nothing is exempt — including the chat that was
    // open when the phone went into a pocket.
    const backgrounded = { openChatGroupId: 'g1', openBoardGroupId: 'g1', visible: false };
    expect(alertFor(CHAT, 'me', backgrounded)).not.toBeNull();
    expect(alertFor(GAME, 'me', backgrounded)).not.toBeNull();
  });

  it('still says nothing about your own, backgrounded or not', () => {
    expect(
      alertFor(CHAT, 'kenji', { openChatGroupId: null, openBoardGroupId: null, visible: false }),
    ).toBeNull();
  });

  it('tags one notification per crew per kind', () => {
    // A crew mid-conversation replaces its own rather than stacking eleven of
    // them down the shade — but its board post is separate news.
    expect(alertFor(CHAT, 'me', LOOKING_AT_NOTHING)?.tag).toBe('lane-log-message-g1');
    expect(alertFor(GAME, 'me', LOOKING_AT_NOTHING)?.tag).toBe('lane-log-game-g1');
    expect(alertFor({ ...CHAT, groupId: 'g2' }, 'me', LOOKING_AT_NOTHING)?.tag).toBe(
      'lane-log-message-g2',
    );
  });
});
