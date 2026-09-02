import { useCallback, useEffect, useRef, useState } from 'react';
import { t, tf } from '../lib/i18n';
import { Avatar } from '../components/Avatar';
import { describeBackendFailure } from '../lib/backend';
import {
  loadMessages,
  markRead,
  sendMessage,
  toMessage,
  watchMessages,
  type ProfileRow,
} from '../lib/social';
import type { ChatMessage, Group } from '../data/groups';
import type { Session } from '../lib/session';

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
      if (live) add(toMessage(row, authorsRef.current, session.id));
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

      {session.isGuest ? (
        <div className="note note--info" style={{ margin: 0 }}>
          {t('Guests can read a group they were sent, but posting needs an account.')}
        </div>
      ) : (
        <div className="composer">
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
