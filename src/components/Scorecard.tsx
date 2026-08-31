import { frameMarks, type Scorecard as ScorecardModel } from '../lib/scoring';

interface Props {
  scorecard: ScorecardModel;
  /** Frame the next ball lands in, highlighted while a game is in progress. */
  activeFrame?: number | null;
}

/** The ten-box strip that everyone who bowls already knows how to read. */
export function Scorecard({ scorecard, activeFrame = null }: Props) {
  return (
    <div className="scorecard">
      <div className="scorecard__grid">
        {scorecard.frames.map((frame) => {
          const marks = frameMarks(frame);
          const slots = frame.index === 9 ? 3 : 2;

          return (
            <div
              key={frame.index}
              className={[
                'frame',
                frame.index === 9 ? 'frame--tenth' : '',
                frame.index === activeFrame ? 'frame--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="frame__number">{frame.index + 1}</div>
              <div className="frame__marks">
                {Array.from({ length: slots }, (_, slot) => (
                  <div key={slot} className="frame__mark">
                    {marks[slot] ?? ' '}
                  </div>
                ))}
              </div>
              <div className="frame__score mono">
                {frame.score === null ? ' ' : frame.score}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
