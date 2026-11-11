import { describe, expect, it } from 'vitest';
import { Harness, item } from './helpers/engine.ts';
import { accused, tally } from '../src/server/games/common.ts';
import { outsiderCountFor, type OutsiderState } from '../src/server/games/outsider.ts';
import type { OddQuestionState } from '../src/server/games/oddQuestion.ts';
import type { TabooState } from '../src/server/games/taboo.ts';
import { scoreAnswer, type SpeedQuizState } from '../src/server/games/speedQuiz.ts';
import { guessPoints, hintMask, type DrawGuessState } from '../src/server/games/drawGuess.ts';
import type { MostLikelyState } from '../src/server/games/mostLikely.ts';

const json = (v: unknown) => JSON.stringify(v);

describe('voting helpers', () => {
  it('accuses the top vote-getter', () => {
    expect(accused(tally({ a: 'c', b: 'c', c: 'a' }, ['a', 'b', 'c']), 1)).toEqual(['c']);
  });
  it('a tie at the cut-off favours the outsider (nobody accused)', () => {
    expect(accused(tally({ a: 'b', b: 'a' }, ['a', 'b', 'c']), 1)).toEqual([]);
  });
  it('supports multiple slots', () => {
    expect(accused({ a: 3, b: 2, c: 2, d: 0 }, 2)).toEqual(['a']);
    expect(accused({ a: 3, b: 2, c: 1 }, 2).sort()).toEqual(['a', 'b']);
  });
  it('ignores votes for non-candidates', () => {
    expect(tally({ a: 'zzz' }, ['a', 'b'])).toEqual({ a: 0, b: 0 });
  });
});

describe('مين برا السالفة؟ (outsider-word)', () => {
  it('outsider count scales with players', () => {
    expect(outsiderCountFor(3, 3)).toBe(1);
    expect(outsiderCountFor(3, 5)).toBe(2);
    expect(outsiderCountFor(3, 8)).toBe(3);
    expect(outsiderCountFor(2, 4)).toBe(1);
  });

  it('distributes the secret word privately and never to the outsider', () => {
    const h = new Harness<OutsiderState>('outsider-word', 5, { rounds: 2, outsiders: 1 });
    const outsider = h.state.outsiders[0];
    const word = h.state.secret!.word!;
    for (const p of h.players) {
      const v = h.view(p);
      if (p === outsider) {
        expect(v.me.role).toBe('outsider');
        expect(v.me.word).toBeUndefined();
        expect(json(v)).not.toContain(word);
      } else {
        expect(v.me.role).toBe('insider');
        expect(v.me.word).toBe(word);
        // insiders must not learn who the outsider is
        expect(json(v.reveal)).toBe('null');
      }
    }
    // spectator sees nothing secret
    expect(json(h.view('spectator'))).not.toContain(word);
  });

  it('plays a full round with correct scoring', () => {
    const h = new Harness<OutsiderState>('outsider-word', 4, { rounds: 1 });
    const out = h.state.outsiders[0];
    const insiders = h.players.filter((p) => p !== out);
    for (const p of h.players) h.act(p, 'seen');
    expect(h.state.phase).toBe('turns');
    // turns: only the current asker may advance
    const notAsker = h.state.order.find((p) => p !== h.state.order[h.state.turnIndex])!;
    expect(() => h.act(notAsker, 'turn:done')).toThrow();
    for (let i = 0; i < 4; i++) h.act(h.state.order[h.state.turnIndex], 'turn:done');
    expect(h.state.phase).toBe('discuss');
    for (const p of h.players) h.act(p, 'ready-vote');
    expect(h.state.phase).toBe('vote');
    expect(() => h.act(insiders[0], 'vote', { target: insiders[0] })).toThrow(); // no self vote
    expect(() => h.act(insiders[0], 'vote', { target: 'ghost' })).toThrow();
    // all insiders vote for the outsider; outsider votes for an insider
    for (const p of insiders) h.act(p, 'vote', { target: out });
    // the answer is hidden from the outsider until the vote closes
    h.act(out, 'vote', { target: insiders[0] });
    expect(h.state.phase).toBe('verdict');
    expect(h.state.caught).toEqual([out]);
    // during verdict the answer is still hidden from everyone's payload
    expect(json(h.view(out))).not.toContain(h.state.secret!.word!);
    h.expire();
    expect(h.state.phase).toBe('guess');
    const opts = h.view(out).me.guessOptions as string[];
    expect(opts).toContain(h.state.secret!.word);
    expect(h.view(insiders[0]).me.guessOptions).toBeUndefined();
    expect(() => h.act(insiders[0], 'guess', { choice: opts[0] })).toThrow();
    expect(() => h.act(out, 'guess', { choice: 'not-an-option' })).toThrow();
    h.act(out, 'guess', { choice: h.state.secret!.word });
    expect(h.state.phase).toBe('roundEnd');
    for (const p of insiders) expect(h.state.scores[p]).toBe(1);
    expect(h.state.scores[out]).toBe(2); // caught (0) + correct guess (+2)
    h.expire();
    expect(h.state.finished).toBe(true);
    expect(h.state.results!.ranking).toHaveLength(4);
  });

  it('an undetected outsider earns 2 points and timers advance phases', () => {
    const h = new Harness<OutsiderState>('outsider-word', 4, { rounds: 2 });
    const out = h.state.outsiders[0];
    h.expire(); // reveal → turns
    for (let i = 0; i < 4; i++) h.expire(); // all turns time out
    expect(h.state.phase).toBe('discuss');
    h.expire(); // discuss → vote
    h.expire(); // vote closes with no votes
    expect(h.state.caught).toEqual([]);
    expect(h.state.scores[out]).toBe(2);
    h.expire(); // verdict → guess
    h.expire(); // guess timeout
    h.expire(); // roundEnd → round 2
    expect(h.state.round).toBe(2);
    expect(h.state.phase).toBe('reveal');
  });

  it('rejects voting outside the vote phase', () => {
    const h = new Harness<OutsiderState>('outsider-word', 3);
    expect(() => h.act('p0', 'vote', { target: 'p1' })).toThrow();
  });

  it('spectators cannot act', () => {
    const h = new Harness<OutsiderState>('outsider-word', 3);
    expect(() => h.act('intruder', 'seen')).toThrow();
  });

  it('handles the outsider leaving mid-round', () => {
    const h = new Harness<OutsiderState>('outsider-word', 4, { rounds: 2 });
    const out = h.state.outsiders[0];
    const draft = structuredClone(h.state);
    h.engine.playerLeft!(draft, out, h.ctx());
    h.state = draft;
    expect(h.state.round).toBe(2);
    expect(h.state.players).not.toContain(out);
  });

  it('word pictures go only to players who know the word, and to everyone at round end', () => {
    const content = Array.from({ length: 5 }, (_, i) => item('word', i, { word: `توم${i}`, image: `pic-${i}` }, 'cartoons'));
    const h = new Harness<OutsiderState>('outsider-word', 4, { rounds: 1 }, content);
    const out = h.state.outsiders[0];
    const img = h.state.secret!.wordImage!;
    expect(img).toMatch(/^pic-/);
    for (const p of h.players) {
      const v = h.view(p);
      if (p === out) {
        expect(v.me.wordImage).toBeUndefined();
        expect(json(v)).not.toContain(img);
      } else expect(v.me.wordImage).toBe(`/img/${img}?for=${p}`);
    }
    for (const p of h.players) h.act(p, 'seen');
    for (let i = 0; i < 4; i++) h.expire();
    h.expire(); // discuss → vote
    h.expire(); // close vote
    expect(json(h.view(out))).not.toContain(img); // still hidden during verdict
    h.expire(); // verdict → guess
    expect(json(h.view(out))).not.toContain(img); // and while the outsider guesses
    h.act(out, 'guess', { choice: h.state.secret!.word });
    expect(h.view(out).reveal.wordImage).toBe(`/img/${img}?for=${out}`);
  });

  it('masks the secret word in chat while hidden', () => {
    const h = new Harness<OutsiderState>('outsider-word', 3);
    expect(h.engine.chatSecrets!(h.state)).toEqual([h.state.secret!.word]);
  });
});

describe('مين برا الرسمة؟ (outsider-picture)', () => {
  it('normal mode: each player only receives a URL for their own picture and the outsider is not told', () => {
    const h = new Harness<OutsiderState>('outsider-picture', 4, { mode: 'normal' });
    const out = h.state.outsiders[0];
    const { imageA, imageB } = h.state.secret!;
    for (const p of h.players) {
      const v = h.view(p);
      expect(v.me.role).toBe('unknown');
      const s = json(v);
      if (p === out) {
        expect(v.me.image).toBe(`/img/${imageB}?for=${p}`);
        expect(s).not.toContain(imageA!);
      } else {
        expect(v.me.image).toBe(`/img/${imageA}?for=${p}`);
        expect(s).not.toContain(imageB!);
      }
    }
  });

  it('easy mode: outsider gets no image and knows it', () => {
    const h = new Harness<OutsiderState>('outsider-picture', 4, { mode: 'easy' });
    const out = h.state.outsiders[0];
    const v = h.view(out);
    expect(v.me.role).toBe('outsider');
    expect(v.me.image).toBeNull();
    expect(json(v)).not.toContain(h.state.secret!.imageA!);
  });

  it('reveals both pictures to everyone after the guess', () => {
    const h = new Harness<OutsiderState>('outsider-picture', 3, { mode: 'hard', rounds: 1 });
    const out = h.state.outsiders[0];
    for (const p of h.players) h.act(p, 'seen');
    for (let i = 0; i < 3; i++) h.expire();
    h.expire(); // discuss → vote
    h.expire(); // close vote
    h.expire(); // verdict → guess
    expect(h.view(h.players.find((p) => p !== out)!).reveal.imageA).toBeNull();
    h.act(out, 'guess', { choice: h.state.secret!.labelA });
    expect(h.state.phase).toBe('roundEnd');
    const v = h.view(h.players.find((p) => p !== out)!);
    expect(v.reveal.imageA).toContain(h.state.secret!.imageA);
    expect(v.reveal.imageB).toContain(h.state.secret!.imageB);
    expect(h.state.scores[out]).toBe(4); // undetected +2 and correct guess +2
  });
});

describe('مين الأطرش بالزفة؟ (odd-question)', () => {
  it('gives the outsider a different question without telling them and hides answers until all answered', () => {
    const h = new Harness<OddQuestionState>('odd-question', 4, { rounds: 1 });
    const out = h.state.outsider!;
    for (const p of h.players) {
      const v = h.view(p);
      expect(v.me.question).toBe(p === out ? h.state.pair!.outsider : h.state.pair!.majority);
      expect(json(v)).not.toContain(p === out ? h.state.pair!.majority : h.state.pair!.outsider);
      expect(v.answers).toBeNull();
      expect('outsider' in v).toBe(false);
    }
    h.act('p0', 'answer', { text: '  منسف  ' });
    expect(h.view('p1').answers).toBeNull();
    for (const p of h.players.slice(1)) h.act(p, 'answer', { text: 'جواب' });
    expect(h.state.phase).toBe('discuss');
    const v = h.view('p1');
    expect(v.answers.p0).toBe('منسف');
    expect(v.majorityQuestion).toBe(h.state.pair!.majority);
    expect(v.reveal).toBeNull();
    h.expire();
    const others = h.players.filter((p) => p !== out);
    for (const p of others) h.act(p, 'vote', { target: out });
    h.act(out, 'vote', { target: others[0] });
    expect(h.state.caught).toBe(true);
    for (const p of others) expect(h.state.scores[p]).toBe(1);
    expect(h.state.scores[out]).toBe(0);
    expect(h.view(others[0]).reveal.outsider).toBe(out);
  });

  it('rejects empty answers', () => {
    const h = new Harness<OddQuestionState>('odd-question', 3);
    expect(() => h.act('p0', 'answer', { text: '   ' })).toThrow();
  });
});

describe('مين غالباً؟ (most-likely)', () => {
  it('awards majority voters and keeps anonymous votes hidden', () => {
    const h = new Harness<MostLikelyState>('most-likely', 4, { rounds: 1, anonymous: true });
    h.act('p0', 'vote', { target: 'p2' });
    h.act('p1', 'vote', { target: 'p2' });
    h.act('p2', 'vote', { target: 'p2' }); // self vote allowed
    h.act('p3', 'vote', { target: 'p0' });
    expect(h.state.phase).toBe('results');
    expect(h.state.winners).toEqual(['p2']);
    expect(h.state.scores).toMatchObject({ p0: 1, p1: 1, p2: 1, p3: 0 });
    const v = h.view('p3');
    expect(v.result.votes).toBeNull();
    expect(v.result.counts.p2).toBe(3);
    h.expire();
    expect(h.state.finished).toBe(true);
    expect(h.state.results!.awards![0].playerId).toBe('p2');
  });
  it('public voting shows voters', () => {
    const h = new Harness<MostLikelyState>('most-likely', 3, { anonymous: false });
    for (const p of h.players) h.act(p, 'vote', { target: 'p1' });
    expect(h.view('p0').result.votes).toEqual({ p0: 'p1', p1: 'p1', p2: 'p1' });
  });
});

describe('ممنوع تحكي! (taboo)', () => {
  function setup() {
    const h = new Harness<TabooState>('taboo', 4, { turnsPerPlayer: 1, maxSkips: 1 });
    const explainer = h.state.explainer!;
    const team = h.state.teams[explainer];
    const mate = h.players.find((p) => p !== explainer && h.state.teams[p] === team)!;
    const opp = h.players.find((p) => h.state.teams[p] !== team)!;
    return { h, explainer, team, mate, opp };
  }
  it('builds balanced teams and shows the card only to the explainer and opponents', () => {
    const { h, explainer, mate, opp } = setup();
    expect(Object.values(h.state.teams).filter((t) => t === 0)).toHaveLength(2);
    expect(() => h.act(mate, 'start')).toThrow();
    h.act(explainer, 'start');
    expect(h.state.phase).toBe('turn');
    const word = h.state.card!.word;
    expect(h.view(explainer).card.word).toBe(word);
    expect(h.view(opp).card.word).toBe(word);
    expect(h.view(mate).card).toBeNull();
    expect(json(h.view(mate))).not.toContain(word);
  });
  it('scores correct, skip limits, buzz penalties and text guesses', () => {
    const { h, explainer, team, mate, opp } = setup();
    h.act(explainer, 'start');
    h.act(explainer, 'correct', { card: h.state.cardIndex });
    expect(h.state.teamScores[team]).toBe(1);
    // stale card index is rejected (double tap protection)
    expect(() => h.act(explainer, 'correct', { card: h.state.cardIndex - 1 })).toThrow();
    h.act(explainer, 'skip', { card: h.state.cardIndex });
    expect(() => h.act(explainer, 'skip', { card: h.state.cardIndex })).toThrow(); // only 1 skip
    expect(() => h.act(mate, 'buzz', { card: h.state.cardIndex })).toThrow(); // own team cannot buzz
    h.act(opp, 'buzz', { card: h.state.cardIndex });
    expect(h.state.teamScores[team]).toBe(0);
    const word = h.state.card!.word;
    expect(() => h.act(opp, 'guess', { text: word })).toThrow();
    h.act(mate, 'guess', { text: 'غلط' });
    h.act(mate, 'guess', { text: word });
    expect(h.state.teamScores[team]).toBe(1);
    expect(h.state.scores[mate]).toBe(1);
    h.expire();
    expect(h.state.phase).toBe('turnEnd');
    h.expire();
    expect(h.state.turnTeam).toBe(1 - team);
  });
  it('finishes after all turns with team winners', () => {
    const { h } = setup();
    while (!h.state.finished) {
      if (h.state.phase === 'turn' && h.state.turnTeam === 0) h.act(h.state.explainer!, 'correct', { card: h.state.cardIndex });
      h.expire();
    }
    expect(h.state.results!.winningTeam).toBe(0);
    expect(h.state.results!.winners).toHaveLength(2);
  });
});

describe('تحدي السرعة (speed-quiz)', () => {
  it('scoring formula', () => {
    expect(scoreAnswer(0, 10000, true, 1)).toBe(175);
    expect(scoreAnswer(10000, 10000, false, 1)).toBe(100);
    expect(scoreAnswer(5000, 10000, false, 3)).toBe(145);
    expect(scoreAnswer(0, 10000, false, 99)).toBe(200);
  });
  it('never sends the correct option before reveal and scores server-side timing', () => {
    const h = new Harness<SpeedQuizState>('speed-quiz', 3, { rounds: 5, questionSeconds: 10 });
    expect(h.state.phase).toBe('countdown');
    h.expire();
    expect(h.state.phase).toBe('question');
    const v = h.view('p0');
    expect(v.correct).toBeNull();
    expect(json(v)).not.toContain('"correct":' + h.state.questions[0].correct + ',"answer');
    const correct = h.state.questions[0].correct;
    h.now += 1000;
    h.act('p1', 'answer', { choice: correct });
    h.now += 1000;
    h.act('p0', 'answer', { choice: correct });
    expect(() => h.act('p0', 'answer', { choice: correct })).toThrow(); // one answer only
    expect(() => h.act('p2', 'answer', { choice: 9 })).toThrow();
    h.act('p2', 'answer', { choice: (correct + 1) % 4 });
    expect(h.state.phase).toBe('reveal');
    expect(h.state.firstCorrect).toBe('p1');
    expect(h.state.scores.p1).toBe(scoreAnswer(1000, 10000, true, 1));
    expect(h.state.scores.p0).toBe(scoreAnswer(2000, 10000, false, 1));
    expect(h.state.scores.p2).toBe(0);
    expect(h.view('p2').correct).toBe(correct);
  });
  it('streak bonus accumulates and resets', () => {
    const h = new Harness<SpeedQuizState>('speed-quiz', 1, { rounds: 5 });
    h.expire();
    for (let r = 0; r < 3; r++) {
      h.act('p0', 'answer', { choice: h.state.questions[h.state.round - 1].correct });
      h.expire();
    }
    expect(h.state.streaks.p0).toBe(3);
    h.act('p0', 'answer', { choice: (h.state.questions[h.state.round - 1].correct + 1) % 4 });
    expect(h.state.streaks.p0).toBe(0);
  });
});

describe('ارسم وخمّن (draw-guess)', () => {
  it('hint masks', () => {
    expect(hintMask('كرة قدم', [])).toBe('___ ___');
    expect(hintMask('كرة قدم', [0])).toBe('ك__ ___');
  });
  it('guess points decrease with time', () => {
    expect(guessPoints(0, 80000, 0)).toBe(170);
    expect(guessPoints(80000, 80000, 1)).toBe(50);
  });
  it('only the drawer sees choices/word; correct guesses are hidden from others', () => {
    const h = new Harness<DrawGuessState>('draw-guess', 3, { rounds: 1 });
    const drawer = h.state.drawer!;
    const [g1, g2] = h.players.filter((p) => p !== drawer);
    expect(h.view(drawer).choices).toHaveLength(3);
    expect(h.view(g1).choices).toBeNull();
    expect(() => h.act(g1, 'choose', { choice: 0 })).toThrow();
    h.act(drawer, 'choose', { choice: 1 });
    const word = h.state.word!.word;
    expect(h.view(drawer).word).toBe(word);
    expect(h.view(g1).word).toBeNull();
    expect(json(h.view(g1))).not.toContain(word);
    expect(h.engine.canvas!(h.state)).toEqual({ drawer, turnKey: 't1' });
    expect(() => h.act(drawer, 'guess', { text: word })).toThrow();
    h.act(g1, 'guess', { text: word.slice(0, -1) }); // close
    expect(h.view(g1).feed.at(-1).kind).toBe('close');
    expect(h.view(g2).feed.find((f: { kind: string }) => f.kind === 'close')).toBeUndefined();
    h.now += 4000;
    h.act(g1, 'guess', { text: word });
    expect(h.view(g1).word).toBe(word);
    expect(h.view(g2).word).toBeNull();
    expect(json(h.view(g2))).not.toContain(word);
    expect(h.state.scores[drawer]).toBe(25);
    expect(() => h.act(g1, 'guess', { text: word })).toThrow();
    h.act(g2, 'guess', { text: `  ${word} ` });
    expect(h.state.phase).toBe('turnEnd');
    h.expire();
    expect(h.state.drawer).not.toBe(drawer);
  });
  it('auto-picks a word when the drawer does not choose and finishes after every player drew', () => {
    const h = new Harness<DrawGuessState>('draw-guess', 2, { rounds: 1 });
    let turns = 0;
    while (!h.state.finished) {
      if (h.state.phase === 'choose') turns++;
      h.expire();
    }
    expect(turns).toBe(2);
  });
});
