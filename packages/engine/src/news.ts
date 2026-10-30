import { shortName } from './players.ts';
import type { Club, Competition, EntityType, GameState, NewsCategory, NewsItem, Player } from './types.ts';

/** Entity link markup understood by the UI: [[type:id|label]]. */
export function link(type: EntityType, id: string, label: string): string {
  return `[[${type}:${id}|${label.replace(/[[\]|]/g, '')}]]`;
}

export const clubLink = (club: Club): string => link('club', club.id, club.name);
export const playerLink = (player: Player): string => link('player', player.id, shortName(player));
export const competitionLink = (competition: Competition): string => link('competition', competition.id, competition.name);

export type RichTextPart = { text: string } | { type: EntityType; id: string; label: string };

const LINK_PATTERN = /\[\[(club|player|competition|nation):([^|\]]+)\|([^\]]*)\]\]/g;

export function parseRichText(text: string): RichTextPart[] {
  const parts: RichTextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index) });
    parts.push({ type: match[1] as EntityType, id: match[2] as string, label: match[3] as string });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** Plain text with links reduced to their labels. */
export function plainText(text: string): string {
  return text.replace(LINK_PATTERN, (_all, _type, _id, label: string) => label);
}

export function addNews(
  state: GameState,
  item: { category: NewsCategory; title: string; body: string; important?: boolean },
): NewsItem {
  state.counters.news++;
  const news: NewsItem = {
    id: `n${state.counters.news}`,
    date: state.date,
    category: item.category,
    title: item.title,
    body: item.body,
    read: false,
    important: item.important ?? false,
  };
  state.news.unshift(news);
  return news;
}
