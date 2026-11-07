import {
  autoTactics, FORMATIONS, type GameState, humanFixtureOn, normalizeTactics, readyTactics, seasonTable,
  shortName, squadOf,
} from '@moc/engine';
import { useEffect, useRef } from 'react';
import { fitLabel, optionLabel, statusOf } from '../screens/TacticsScreen.tsx';
import { ClubName } from './ClubName.tsx';
import { ordinal } from './format.ts';

interface Check {
  tone: 'warn' | 'info';
  text: string;
}

/** What a manager would want to know before kick-off, from their saved selection. */
function preMatchChecks(game: GameState): Check[] {
  const clubId = game.manager.clubId;
  if (!clubId) return [];
  const squad = squadOf(game, clubId);
  const saved = normalizeTactics(game.manager.tactics ?? autoTactics(squad, game.date));
  const ready = readyTactics(saved, squad, game.date);
  const players = game.world.players;
  const slots = FORMATIONS[ready.formation];
  const checks: Check[] = [];

  slots.forEach((slot, i) => {
    const was = saved.lineup[i] ?? null;
    const now = ready.lineup[i] ?? null;
    const incoming = now ? players[now] : undefined;
    if (was === now || !incoming) return;
    const outgoing = was ? players[was] : undefined;
    const reason = outgoing ? statusOf(outgoing, game.date) ?? 'unavailable' : null;
    checks.push({
      tone: 'warn',
      text: outgoing
        ? `${shortName(outgoing)} (${reason?.split(' (')[0]?.toLowerCase()}) will be replaced at ${slot.position} by ${shortName(incoming)}.`
        : `Nobody is picked at ${slot.position}: ${shortName(incoming)} will play there.`,
    });
  });

  slots.forEach((slot, i) => {
    const id = ready.lineup[i];
    const p = id ? players[id] : undefined;
    if (!p) return;
    if (p.condition < 80) checks.push({ tone: 'warn', text: `${shortName(p)} is only ${p.condition}% fit.` });
    const fit = fitLabel(p, slot.position).tone;
    if (fit === 'awkward') checks.push({ tone: 'warn', text: `${shortName(p)} is out of position at ${slot.position}.` });
    else if (fit === 'unconvincing') checks.push({ tone: 'warn', text: `${shortName(p)} is unconvincing at ${slot.position}.` });
  });

  if (ready.bench.length < 9) checks.push({ tone: 'info', text: `Only ${ready.bench.length} substitutes are available.` });
  return checks;
}

export function ReadyDialog(props: { game: GameState; onGo: () => void; onReview: () => void; onClose: () => void }) {
  const { game } = props;
  const goRef = useRef<HTMLButtonElement>(null);
  const fixture = humanFixtureOn(game, game.date);

  useEffect(() => {
    goRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  if (!fixture || !game.manager.clubId) return null;
  const home = game.world.clubs[fixture.homeId];
  const away = game.world.clubs[fixture.awayId];
  const competition = game.world.competitions[fixture.competitionId];
  const opponentId = fixture.homeId === game.manager.clubId ? fixture.awayId : fixture.homeId;
  const season = game.seasons[fixture.seasonId];
  const table = season && season.status !== 'scheduled' ? seasonTable(game, season) : [];
  const opponentRow = table.findIndex((r) => r.clubId === opponentId);
  const opponentForm = table[opponentRow]?.form ?? [];
  const tactics = normalizeTactics(game.manager.tactics ?? autoTactics(squadOf(game, game.manager.clubId), game.date));
  const checks = preMatchChecks(game);

  return (
    <div className="dialog-backdrop" onClick={props.onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="ready-title" onClick={(e) => e.stopPropagation()}>
        <p className="dialog-eyebrow">Match day · {competition?.shortName}, round {fixture.round}</p>
        <h2 id="ready-title" className="dialog-fixture">
          {home && <ClubName club={home} short />} <span className="muted">v</span> {away && <ClubName club={away} short />}
        </h2>
        <p className="muted small">
          {home?.stadium}
          {opponentRow >= 0 && ` · ${game.world.clubs[opponentId]?.shortName} are ${ordinal(opponentRow + 1)}`}
          {opponentForm.length > 0 && `, form ${opponentForm.join('')}`}
        </p>

        <p className="dialog-plan">
          {tactics.formation} · {optionLabel(tactics.instructions.mentality)}
          {tactics.instructions.counter === 'on' ? ' · counter-attack' : ''}
          {tactics.instructions.offsideTrap === 'on' ? ' · offside trap' : ''}
        </p>

        <h3 className="dialog-question">Are you ready?</h3>
        {checks.length === 0 ? (
          <p className="check ok">Your team is picked and everyone is fit.</p>
        ) : (
          <ul className="checks">
            {checks.map((c, i) => (
              <li key={i} className={`check ${c.tone}`}>
                {c.text}
              </li>
            ))}
          </ul>
        )}

        <div className="dialog-actions">
          <button className="btn" onClick={props.onReview}>
            Review tactics
          </button>
          <button ref={goRef} className="btn primary main-action" onClick={props.onGo}>
            Go to the match
          </button>
        </div>
      </div>
    </div>
  );
}
