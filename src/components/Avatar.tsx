interface Props {
  initials: string;
  size?: number;
  /** The signed-in bowler's own avatar is accent-tinted throughout. */
  isMe?: boolean;
  isLeader?: boolean;
  square?: boolean;
  /**
   * A chosen colour, as hex. Overrides the accent tint, so the bowler's own
   * tile looks like the one they picked rather than like everyone else's
   * highlight — and a crew of six is six colours rather than one and five
   * greys.
   */
  tint?: string;
}

/** Initials on a deterministic tint — no uploads, no broken image states. */
export function Avatar({
  initials,
  size = 30,
  isMe = false,
  isLeader = false,
  square = false,
  tint,
}: Props) {
  // `28` and `66` are the alpha of the two accent steps this replaces, kept so
  // a tinted tile has the same weight on the page as an untinted one.
  const background = tint
    ? `${tint}28`
    : isLeader
      ? 'var(--color-accent-800)'
      : isMe
        ? 'var(--color-accent-900)'
        : 'var(--color-neutral-800)';

  const border = tint
    ? `${tint}99`
    : isLeader
      ? 'var(--color-accent-500)'
      : isMe
        ? 'var(--color-accent-700)'
        : 'var(--color-neutral-700)';

  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background,
        color: tint ?? (isLeader || isMe ? '#cfc7ff' : 'var(--color-neutral-300)'),
        boxShadow: `inset 0 0 0 1px ${border}${
          isLeader ? ', 0 0 22px -4px rgba(145,132,217,.85)' : ''
        }`,
        borderRadius: square ? Math.round(size * 0.3) : '50%',
        fontSize: Math.max(9, Math.round(size * 0.35)),
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
