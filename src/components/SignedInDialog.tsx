import { useEffect, useRef } from 'react';
import { t, tf } from '../lib/i18n';
import { initialsOf } from '../lib/social';
import { Avatar } from './Avatar';

interface Props {
  name: string;
  email?: string;
  photo?: string | null;
  tint?: string;
  onDismiss: () => void;
}

/**
 * "That worked", said once, after coming back from the provider.
 *
 * Signing in is the only thing in the app that leaves the page: the bowler taps
 * Continue with Google, goes through somebody else's screens, and comes back to
 * a *fresh load* of the dashboard. Nothing about that load says the round trip
 * succeeded — the one changed word is a name on a screen they are not looking
 * at — so the honest reading of a silent return is that it failed, and the next
 * thing somebody does is try again.
 *
 * A native `<dialog>` rather than a card in the page, because this is the one
 * moment the app has something to say that is worth interrupting for: it takes
 * the focus, Escape closes it, and everything behind it goes inert without any
 * of that being written here.
 */
export function SignedInDialog({ name, email, photo, tint, onDismiss }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // `showModal` throws if it is somehow already open, and an exception here
    // would take down the app on the one screen that exists to say things went
    // well.
    try {
      if (!dialog.open) dialog.showModal();
    } catch {
      // Nothing to do: the dialog stays a plain block in the page, which still
      // says what it says.
    }

    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="signed-in-title"
      // Escape, and the backdrop on browsers that close on it, both land here
      // rather than leaving a dialog that is shut but still mounted.
      onClose={onDismiss}
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop: the
        // card inside it covers everything else.
        if (event.target === ref.current) ref.current?.close();
      }}
    >
      <div className="dialog__body">
        <div className="dialog__mark">
          <Avatar initials={initialsOf(name)} size={56} isMe photo={photo} tint={tint} />
        </div>

        <h2 id="signed-in-title" className="dialog__title">
          {t('Signed in')}
        </h2>

        <p className="dialog__lead">{tf('You are signed in as {name}.', { name })}</p>
        {email && <p className="dialog__meta tnum">{email}</p>}

        <p className="dialog__note">
          {t('Your crews, the board and the chat are open now. Your games stay on this phone either way.')}
        </p>

        <button type="button" className="btn-lg btn-lg--primary" onClick={() => ref.current?.close()}>
          {t('Go to your crews')}
        </button>
      </div>
    </dialog>
  );
}
