import { describe, expect, it } from 'vitest';
import { deckFor, FULL_RACK } from '../src/lib/pins';
import { isGameComplete, pinsAvailable } from '../src/lib/scoring';

/**
 * The rack, fuzzed.
 *
 * `deckFor` decides which pins a bowler is *shown*, and therefore which pins
 * get recorded against the ball they throw. A deck with the wrong pins on it is
 * not a display bug: the leave it produces goes into the game, into the leave
 * statistics, and into the practice list, and nothing downstream can tell it
 * from a leave that really happened.
 *
 * The one thing worth proving is that it never *invents* a deck. Its last line
 * falls back to `standing.slice(0, available)` when the scorer and the pinfalls
 * disagree about how many pins are up — which is the right answer for a game
 * half-entered on the number pad, and would be a real bug for a game entered
 * entirely on the rack. These bowl thousands of rack games looking for one.
 */

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/** Bowl a whole game on the rack, exactly as the play screen does. */
function bowl(rand: () => number): { rolls: number[]; pinfalls: number[][]; decks: number[][] } {
  const rolls: number[] = [];
  const pinfalls: number[][] = [];
  const decks: number[][] = [];

  while (!isGameComplete(rolls)) {
    const deck = deckFor(rolls, pinfalls);
    decks.push(deck);

    // Take some of what is standing, the way a tap does: a subset of the deck
    // the screen is showing, never anything else.
    const taking = Math.floor(rand() * (deck.length + 1));
    const shuffled = [...deck].sort(() => rand() - 0.5);
    const knocked = shuffled.slice(0, taking);

    rolls.push(knocked.length);
    pinfalls.push(knocked);
  }

  return { rolls, pinfalls, decks };
}

describe('deckFor, over whole games bowled on the rack', () => {
  it('always shows exactly the number of pins the scorer says are up', () => {
    // The count is the scorer's to decide — it knows about re-racks and the
    // tenth. If these two ever disagree the screen is lying about one of them.
    for (let seed = 1; seed <= 400; seed++) {
      const rand = seeded(seed);
      const rolls: number[] = [];
      const pinfalls: number[][] = [];

      while (!isGameComplete(rolls)) {
        const available = pinsAvailable(rolls);
        const deck = deckFor(rolls, pinfalls);
        expect(deck.length, `seed ${seed}, after ${rolls.join(',')}`).toBe(available);

        const taking = Math.floor(rand() * (deck.length + 1));
        const knocked = [...deck].sort(() => rand() - 0.5).slice(0, taking);
        rolls.push(knocked.length);
        pinfalls.push(knocked);
      }
    }
  });

  it('never invents a pin that could not be standing', () => {
    // Every deck is either a full rack, or a subset of the deck before it.
    for (let seed = 1; seed <= 400; seed++) {
      const { decks, pinfalls } = bowl(seeded(seed));

      decks.forEach((deck, i) => {
        const unique = new Set(deck);
        expect(unique.size, `seed ${seed}, ball ${i}: a pin twice`).toBe(deck.length);
        for (const pin of deck) expect(FULL_RACK).toContain(pin);

        if (i === 0 || deck.length === FULL_RACK.length) return;

        // A partial deck must be what survived the ball before it, exactly.
        const before = decks[i - 1];
        const knocked = new Set(pinfalls[i - 1]);
        const survived = before.filter((pin) => !knocked.has(pin));
        expect([...deck].sort((a, b) => a - b), `seed ${seed}, ball ${i}`).toEqual(
          survived.sort((a, b) => a - b),
        );
      });
    }
  });

  it('re-racks for the first ball of every frame', () => {
    // The case that would be least visible and worst: an open frame leaves
    // pins standing, and the frame after it must still start with ten.
    const openEveryFrame: number[][] = [];
    const rolls: number[] = [];

    while (!isGameComplete(rolls)) {
      const deck = deckFor(rolls, openEveryFrame);
      // Nine, then nothing: an open frame every time.
      const knocked = rolls.length % 2 === 0 ? deck.slice(0, deck.length - 1) : [];
      rolls.push(knocked.length);
      openEveryFrame.push(knocked);
    }

    // Ten frames of 9 and a miss, plus nothing extra in the tenth.
    expect(rolls.slice(0, 20)).toEqual(
      Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 9 : 0)),
    );
  });
});
