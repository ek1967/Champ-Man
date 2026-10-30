import { formatShort, type GameState } from '@moc/engine';
import { useEffect } from 'react';
import { RichText } from '../components/RichText.tsx';
import { replaceRoute } from '../state/nav.ts';
import { touchGame } from '../state/store.ts';

export function InboxScreen({ game, newsId }: { game: GameState; newsId?: string }) {
  const selected = game.news.find((n) => n.id === newsId) ?? game.news[0];

  useEffect(() => {
    if (selected && !selected.read) {
      selected.read = true;
      touchGame();
    }
  }, [selected]);

  return (
    <div className="inbox">
      <ul className="inbox-list" aria-label="News">
        {game.news.map((item) => (
          <li key={item.id}>
            <button
              className={`inbox-item ${item.id === selected?.id ? 'is-selected' : ''} ${item.read ? '' : 'is-unread'}`}
              onClick={() => replaceRoute({ screen: 'inbox', newsId: item.id })}
            >
              <span className="inbox-date">{formatShort(item.date)}</span>
              <span className="inbox-title">{item.title}</span>
            </button>
          </li>
        ))}
        {game.news.length === 0 && <li className="muted pad">No news yet.</li>}
      </ul>
      <article className="inbox-detail">
        {selected ? (
          <>
            <p className="muted small">{formatShort(selected.date)}</p>
            <h2>{selected.title}</h2>
            <RichText text={selected.body} />
          </>
        ) : (
          <p className="muted">Nothing to read.</p>
        )}
      </article>
    </div>
  );
}
