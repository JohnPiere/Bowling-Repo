import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { SAMPLE_MESSAGES, type ChatMessage, type Group } from '../data/groups';
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
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => SAMPLE_MESSAGES[group.id] ?? [],
  );
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  // Land at the newest message, the way every chat is expected to open.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  function send() {
    const body = draft.trim();
    if (!body) return;

    setMessages((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        authorId: session.id,
        author: 'You',
        initials: 'YOU',
        // 24-hour, to match the rest of the thread.
        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        body,
      },
    ]);
    setDraft('');
  }

  return (
    <div className="chat">
      <div className="chat__thread">
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
                      <span className="pill">Shared to board</span>
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
          Guests can read a group they were sent, but posting needs an account.
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
            placeholder={`Message ${group.name}`}
            aria-label="Message"
          />
          <button
            type="button"
            className="iconbtn iconbtn--accent"
            onClick={send}
            disabled={!draft.trim()}
            aria-label="Send"
          >
            ↑
          </button>
        </div>
      )}
    </div>
  );
}
