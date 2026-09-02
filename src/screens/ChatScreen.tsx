import { useCallback, useEffect, useRef, useState } from 'react';
import { t, tf } from '../lib/i18n';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { describeBackendFailure } from '../lib/backend';
import {
  loadMessages,
  markRead,
  sendMessage,
  shareGame as postToCrew,
  toMessage,
  watchMessages,
  type ProfileRow,
  type SharedGameRow,
} from '../lib/social';
import type { ChatMessage, Group } from '../lib/social';
import { listGames, shareGame as shareLocally, type Game } from '../lib/db';
import { formatDay } from '../lib/datetime';
import type { Session } from '../lib/session';

/** How far back the picker offers. A chat is about tonight, not about April. */
const RECENT = 10;

interface Props {
  group: Group;
  session: Session;
}

/**
 * Group chat.
 *
 * Conversation about a specific game lives on the shared post, not here — the
 * chat only carries a line pointing at it, so a thread about one game does not
 * scroll away under tonight's lane talk.
 */
export function ChatScreen({ group, session }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(!session.isGuest);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  /** In a ref, not state: the socket callback needs the current one without
      being torn down and re-subscribed every time the roster resolves. */
  const authorsRef = useRef<Map<string, ProfileRow>>(new Map());
  /** The board by row id, for the same reason: a message arriving live names a
      post and the card is drawn from the post, not from the message. */
  const postsRef = useRef<Map<string, SharedGameRow>>(new Map());
  const [picking, setPicking] = useState(false);
  const [recent, setRecent] = useState<Game[] | null>(null);

  const add = useCallback((message: ChatMessage) => {
    // Keyed by the row's own id, so a message that arrives both down the socket
    // and in the reply to our own insert lands once.
    setMessages((current) =>
      current.some((m) => m.id === message.id) ? current : [...current, message],
    );
  }, []);

  useEffect(() => {
    if (session.isGuest) return;

    let live = true;
    setLoading(true);
    setError(null);

    loadMessages(group.id, session.id)
      .then((thread) => {
        if (!live) return;
        authorsRef.current = thread.authors;
        postsRef.current = thread.posts;
        setMessages(thread.messages);
      })
      .catch((err) => {
        if (live) setError(describeBackendFailure(err));
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    // Opening the chat is reading it. The marker is per device, so this is the
    // moment the crew list's unread badge is allowed to clear.
    markRead(group.id);

    const stop = watchMessages(group.id, (row) => {
      if (live) add(toMessage(row, authorsRef.current, session.id, postsRef.current));
    });

    return () => {
      live = false;
      stop();
    };
  }, [group.id, session.id, session.isGuest, add]);

  // Land at the newest message, the way every chat is expected to open.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);
    try {
      await sendMessage(group.id, session.id, body);
      // Not added locally: the row comes back down the socket with the id and
      // timestamp the database gave it. Echoing it here first would show a
      // message that has not been stored, which is the one lie a chat must not
      // tell.
      setDraft('');
    } catch (err) {
      setError(describeBackendFailure(err));
    } finally {
      setSending(false);
    }
  }

  /**
   * Put one of your games in the chat.
   *
   * Two writes and a message: the game goes on the crew's board — an upsert, so
   * a game already there keeps the post it has rather than appearing twice —
   * and the message points at it. The board is where a game lives; the chat
   * carries the line that says it happened, which is the split the schema
   * already assumes.
   *
   * The draft carries if there is one, so "look at the eighth" arrives with the
   * game rather than after it.
   */
  async function shareIntoChat(game: Game) {
    if (sending) return;

    setSending(true);
    setError(null);
    try {
      const post = await postToCrew({
        groupId: group.id,
        me: session.id,
        localId: game.id,
        rolls: game.rolls,
        total: game.total,
        house: game.house,
        playedAt: game.playedAt,
      });
      await shareLocally(game.id, group.id);

      // So the card draws when the row comes back down the socket, rather than
      // on the next time the chat is opened.
      postsRef.current.set(post.id, post);

      await sendMessage(
        group.id,
        session.id,
        draft.trim() || tf('Shared a {n}.', { n: game.total }),
        post.id,
      );
      setDraft('');
      setPicking(false);
    } catch (err) {
      setError(describeBackendFailure(err));
    } finally {
      setSending(false);
    }
  }

  function openPicker() {
    setPicking(true);
    // Read once, the first time it is asked for: a chat that queried the whole
    // archive on open would pay for a button most messages do not use.
    if (recent === null) listGames().then((all) => setRecent(all.slice(0, RECENT)), () => setRecent([]));
  }

  return (
    <div className="chat">
      <div className="chat__thread">
        {loading && messages.length === 0 && <p className="empty">{t('Loading the thread…')}</p>}
        {!loading && !error && messages.length === 0 && (
          <p className="empty">{t('Nothing said yet. Start it off.')}</p>
        )}
        {error && <div className="note note--bad">{error}</div>}

        {messages.map((message) => {
          const isMine = message.author === 'You';
          return (
            <article key={message.id} className={`msg${isMine ? ' msg--mine' : ''}`}>
              <Avatar initials={message.initials} size={28} isMe={isMine} />
              <div className="grow">
                <div className="row" style={{ gap: 8 }}>
                  <span className="msg__author">{message.author}</span>
                  <span className="muted tnum">{message.time}</span>
                </div>
                <p className="msg__body">{message.body}</p>

                {message.sharedScore && (
                  <div className="msg__card">
                    <div className="row row--between">
                      <span className="tnum" style={{ fontSize: 26, letterSpacing: '-0.03em' }}>
                        {message.sharedScore.score}
                      </span>
                      <span className="pill">{t('Shared to board')}</span>
                    </div>
                    <div className="muted tnum">
                      {message.sharedScore.strikes} strikes · {message.sharedScore.spares} spares
                    </div>
                    <div className="muted">{message.sharedScore.alley}</div>
                  </div>
                )}
              </div>
            </article>
          );
        })}
        <div ref={endRef} />
      </div>

      {picking && !session.isGuest && (
        <div className="picker">
          <div className="row row--between" style={{ marginBottom: 6 }}>
            <span className="hero__label">{t('Share a game')}</span>
            <button type="button" className="linkbtn" onClick={() => setPicking(false)}>
              {t('Cancel')}
            </button>
          </div>

          {recent === null && <p className="empty">{t('Looking through your games…')}</p>}
          {recent?.length === 0 && (
            <p className="empty">{t('Nothing to share yet. Bowl a game first.')}</p>
          )}

          {recent?.map((game) => (
            <button
              key={game.id}
              type="button"
              className="game-row"
              disabled={sending}
              onClick={() => shareIntoChat(game)}
            >
              <span className="game-row__score tnum">{game.total}</span>
              <span className="grow">
                <span className="game-row__name" style={{ display: 'block' }}>
                  {formatDay(game.playedAt)}
                </span>
                <span className="game-row__sub">
                  {game.house || t('No alley recorded')}
                </span>
              </span>
              {game.sharedTo?.includes(group.id) && <span className="pill">{t('Shared')}</span>}
            </button>
          ))}
        </div>
      )}

      {session.isGuest ? (
        <div className="note note--info" style={{ margin: 0 }}>
          {t('Guests can read a group they were sent, but posting needs an account.')}
        </div>
      ) : (
        <div className="composer">
          <button
            type="button"
            className="iconbtn"
            onClick={() => (picking ? setPicking(false) : openPicker())}
            aria-expanded={picking}
            aria-label={t('Share a game')}
          >
            <Icon name="plus" size={17} />
          </button>
          <input
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={tf('Message {crew}', { crew: group.name })}
            aria-label={t('Message')}
          />
          <button
            type="button"
            className="iconbtn iconbtn--accent"
            onClick={send}
            disabled={!draft.trim() || sending}
            aria-label={t('Send')}
          >
            ↑
          </button>
        </div>
      )}
    </div>
  );
}
