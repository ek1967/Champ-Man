import {
  boardExpectation, createGame, currentSeasonOf, DEMO_TOP_DIVISION, type GameState, takeJob,
} from '@moc/engine';
import { useEffect, useState } from 'react';
import { ClubSwatch } from '../components/ClubName.tsx';
import { reputationLabel } from '../components/format.ts';
import { resetNavigation } from '../state/nav.ts';
import { deleteCareer, loadCareer, loadCareerSummary, type SaveSummary, saveCareer } from '../state/persistence.ts';
import { setGame } from '../state/store.ts';

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function StartScreen() {
  const [summary, setSummary] = useState<SaveSummary | null>(null);
  const [managerName, setManagerName] = useState('');
  const [seed, setSeed] = useState(randomSeed);
  const [draft, setDraft] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadCareerSummary().then(setSummary);
  }, []);

  async function resume() {
    try {
      const state = await loadCareer();
      if (!state) return;
      resetNavigation();
      setGame(state);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function buildWorld() {
    setDraft(createGame({ seed, managerName: managerName.trim() || 'The Gaffer' }));
  }

  async function chooseClub(clubId: string) {
    if (!draft) return;
    takeJob(draft, clubId);
    await deleteCareer();
    await saveCareer(draft);
    resetNavigation({ screen: 'inbox' });
    setGame(draft);
  }

  if (draft) {
    const season = currentSeasonOf(draft, DEMO_TOP_DIVISION);
    const clubs = (season?.clubIds ?? [])
      .map((id) => draft.world.clubs[id])
      .filter((c) => c !== undefined)
      .sort((a, b) => b.reputation - a.reputation);
    return (
      <div className="start">
        <div className="start-card wide">
          <h1>Choose your club</h1>
          <p className="muted">
            {draft.world.competitions[DEMO_TOP_DIVISION]?.name}, {season?.label}. Bigger clubs have better players and
            higher expectations.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Club</th>
                  <th>Size</th>
                  <th>Stadium</th>
                  <th>Board expects you to</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clubs.map((club) => (
                  <tr key={club.id}>
                    <td>
                      <span className="club-name">
                        <ClubSwatch club={club} />
                        {club.name}
                      </span>
                    </td>
                    <td>{reputationLabel(club.reputation)}</td>
                    <td className="muted">{club.stadium}</td>
                    <td>{boardExpectation(draft, club.id)}</td>
                    <td className="right">
                      <button className="btn small" onClick={() => void chooseClub(club.id)}>
                        Take job
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <button className="btn ghost" onClick={() => setDraft(null)}>
              ← Back
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="start">
      <div className="start-card">
        <h1 className="logo">
          Manager <span>of</span> Champions
        </h1>
        <p className="muted">A fast, text-first football management game.</p>

        {summary && (
          <section className="start-section">
            <h2>Continue career</h2>
            <p>
              {summary.managerName}
              {summary.clubName ? `, ${summary.clubName}` : ''} — {summary.date}
            </p>
            <button className="btn primary" onClick={() => void resume()}>
              Continue career
            </button>
          </section>
        )}

        <section className="start-section">
          <h2>New career</h2>
          <label className="field">
            <span>Your name</span>
            <input value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="The Gaffer" />
          </label>
          <label className="field">
            <span>World seed</span>
            <input value={seed} onChange={(e) => setSeed(e.target.value)} />
          </label>
          <p className="note">
            This is the demo world: a made-up country with made-up clubs and players. The real 2026-27 leagues come in
            a later phase. The game starts on 15 June 2026.
          </p>
          <button className="btn primary" onClick={buildWorld}>
            Create world
          </button>
          {summary && <p className="note">Starting a new career replaces the saved one.</p>}
        </section>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
