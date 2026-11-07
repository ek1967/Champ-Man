import {
  boardExpectation, type Competition, createGame, currentSeasonOf, type GameState, mergePacks, takeJob, type WorldPack,
} from '@moc/engine';
import { useEffect, useState } from 'react';
import { ClubSwatch } from '../components/ClubName.tsx';
import { Tabs } from '../components/Tabs.tsx';
import { reputationLabel } from '../components/format.ts';
import { resetNavigation } from '../state/nav.ts';
import { type CloudSummary, cloudSummary, loadFromCloud } from '../state/cloud.ts';
import { deleteCareer, loadCareer, loadCareerSummary, readSaveFile, type SaveSummary, saveCareer } from '../state/persistence.ts';
import { setGame } from '../state/store.ts';

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Real-world packs, built locally by `npm run data:england` and `npm run data:scotland`. */
const PACK_URLS = ['./packs/england-2026-27.json', './packs/scotland-2026-27.json'];

async function loadPack(url: string): Promise<WorldPack | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as WorldPack;
  } catch {
    return null;
  }
}

/** Every pack that has been built, played together as one world; null when there are none. */
async function loadRealPack(): Promise<WorldPack | null> {
  const packs = (await Promise.all(PACK_URLS.map(loadPack))).filter((p): p is WorldPack => p !== null);
  return packs.length > 0 ? mergePacks(packs) : null;
}

function playableLeagues(state: GameState): Competition[] {
  return Object.values(state.world.competitions)
    .filter((c) => c.tier === 1 && c.mode === 'playable')
    .sort((a, b) => leagueSize(state, b) - leagueSize(state, a));
}

function leagueSize(state: GameState, c: Competition): number {
  return Object.values(state.world.clubs).filter((club) => club.leagueId === c.id).length;
}

export function StartScreen() {
  const [summary, setSummary] = useState<SaveSummary | null>(null);
  const [managerName, setManagerName] = useState('');
  const [seed, setSeed] = useState(randomSeed);
  const [draft, setDraft] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [realPack, setRealPack] = useState<WorldPack | null>(null);
  const [worldChoice, setWorldChoice] = useState<'real' | 'demo'>('real');
  const [leagueId, setLeagueId] = useState<string | null>(null);

  const [cloud, setCloud] = useState<CloudSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void loadCareerSummary().then(setSummary);
    void loadRealPack().then(setRealPack);
    void cloudSummary().then(setCloud);
  }, []);

  /** Opens a career and keeps a browser copy of it. */
  async function open(load: () => Promise<GameState | null>, label: string) {
    setBusy(label);
    setError(null);
    try {
      const state = await load();
      if (!state) return;
      await saveCareer(state);
      resetNavigation();
      setGame(state);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const resume = () => open(loadCareer, 'browser');
  // Which copy is further on, when both exist.
  const cloudIsNewer = !!cloud && (!summary || cloud.savedAt > summary.savedAt);

  function buildWorld() {
    const pack = worldChoice === 'real' && realPack ? realPack : undefined;
    const state = createGame({ seed, managerName: managerName.trim() || 'The Gaffer', pack });
    setLeagueId(playableLeagues(state)[0]?.id ?? null);
    setDraft(state);
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
    const leagues = playableLeagues(draft);
    const competition = leagues.find((c) => c.id === leagueId) ?? leagues[0];
    const season = competition ? currentSeasonOf(draft, competition.id) : null;
    const clubs = (season?.clubIds ?? [])
      .map((id) => draft.world.clubs[id])
      .filter((c) => c !== undefined)
      .sort((a, b) => b.reputation - a.reputation);
    return (
      <div className="start">
        <div className="start-card wide">
          <h1>Choose your club</h1>
          {leagues.length > 1 && competition && (
            <Tabs tabs={leagues.map((c) => ({ id: c.id, label: c.name }))} active={competition.id} onChange={setLeagueId} />
          )}
          <p className="muted">
            {competition?.name}, {season?.label}. Bigger clubs have better players and higher expectations.
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

        {(summary || cloud) && (
          <section className="start-section">
            <h2>Continue career</h2>
            {summary && (
              <div className="save-option">
                <p>
                  <strong>On this device:</strong> {summary.managerName}
                  {summary.clubName ? `, ${summary.clubName}` : ''} · {summary.date}
                </p>
                <button className={`btn ${cloudIsNewer ? '' : 'primary'}`} disabled={!!busy} onClick={() => void resume()}>
                  {busy === 'browser' ? 'Opening…' : 'Continue career'}
                </button>
              </div>
            )}
            {cloud && (
              <div className="save-option">
                <p>
                  <strong>Cloud save:</strong> {cloud.managerName}
                  {cloud.clubName ? `, ${cloud.clubName}` : ''} · {cloud.date}
                  <span className="muted small"> (saved {new Date(cloud.savedAt).toLocaleString()})</span>
                </p>
                <button className={`btn ${cloudIsNewer ? 'primary' : ''}`} disabled={!!busy} onClick={() => void open(loadFromCloud, 'cloud')}>
                  {busy === 'cloud' ? 'Downloading…' : 'Continue from the cloud'}
                </button>
              </div>
            )}
          </section>
        )}
        <section className="start-section">
          <h2>Load a save file</h2>
          <p className="note">Open a file made with "Download save", from this device or another one.</p>
          <input
            id="load-file"
            type="file"
            accept=".json,application/json"
            disabled={!!busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void open(() => readSaveFile(file), 'file');
              e.target.value = '';
            }}
          />
        </section>

        <section className="start-section">
          <h2>New career</h2>
          <label className="field">
            <span>Your name</span>
            <input id="manager-name" value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="The Gaffer" />
          </label>
          <fieldset className="field choices">
            <legend>World</legend>
            <label className={`choice ${realPack ? '' : 'is-disabled'}`}>
              <input
                type="radio"
                name="world"
                id="world-real"
                checked={worldChoice === 'real' && realPack !== null}
                disabled={!realPack}
                onChange={() => setWorldChoice('real')}
              />
              <span>
                <strong>{realPack ? `${realPack.name.replace(/ 2026-27/g, '')} 2026-27` : 'Real world 2026-27'}</strong>
                <small>{realPack ? realPack.notice : 'Not built yet. Run npm run data:england and npm run data:scotland to create it.'}</small>
              </span>
            </label>
            <label className="choice">
              <input
                type="radio"
                name="world"
                id="world-demo"
                checked={worldChoice === 'demo' || realPack === null}
                onChange={() => setWorldChoice('demo')}
              />
              <span>
                <strong>Demo world</strong>
                <small>A made-up country with made-up clubs and players.</small>
              </span>
            </label>
          </fieldset>
          <label className="field">
            <span>Seed (varies young players' potential between careers)</span>
            <input id="seed" value={seed} onChange={(e) => setSeed(e.target.value)} />
          </label>
          <p className="note">The game starts on 15 June 2026.</p>
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
