import { pinsAvailable, PINS } from '../lib/scoring';

interface Props {
  rolls: number[];
  onRoll: (pins: number) => void;
  onUndo: () => void;
  disabled?: boolean;
}

/**
 * Pin entry for a live game.
 *
 * Counts above what is standing are disabled rather than hidden, so the keypad
 * keeps a stable shape between balls instead of reflowing under the thumb.
 */
export function PinKeypad({ rolls, onRoll, onUndo, disabled = false }: Props) {
  const available = pinsAvailable(rolls);
  const isFirstBall = available === PINS;

  return (
    <div className="keypad">
      {Array.from({ length: PINS + 1 }, (_, pins) => {
        const isMark = pins === available;
        const label = pins === 0 ? '–' : isMark && isFirstBall ? 'X' : isMark ? '/' : String(pins);

        return (
          <button
            key={pins}
            type="button"
            className={`keypad__key ${isMark ? 'keypad__key--mark' : ''}`}
            disabled={disabled || pins > available}
            onClick={() => onRoll(pins)}
            aria-label={`Knock down ${pins} ${pins === 1 ? 'pin' : 'pins'}`}
          >
            {label}
          </button>
        );
      })}
      <button
        type="button"
        className="keypad__key keypad__key--wide"
        onClick={onUndo}
        disabled={rolls.length === 0}
      >
        Undo
      </button>
    </div>
  );
}
