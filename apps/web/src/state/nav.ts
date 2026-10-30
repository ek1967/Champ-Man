import { useSyncExternalStore } from 'react';

export type Route =
  | { screen: 'inbox'; newsId?: string }
  | { screen: 'squad'; clubId: string }
  | { screen: 'player'; id: string }
  | { screen: 'club'; id: string }
  | { screen: 'competition'; id: string; tab?: CompetitionTab; seasonId?: string }
  | { screen: 'fixtures'; clubId: string }
  | { screen: 'nation'; id: string }
  | { screen: 'tactics' }
  | { screen: 'match' };

export type CompetitionTab = 'table' | 'fixtures' | 'scorers' | 'history';

/** Browser-style history: every screen change is a step you can go back from. */
let stack: Route[] = [{ screen: 'inbox' }];
let index = 0;
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version++;
  for (const l of listeners) l();
}

export function navigate(route: Route): void {
  const current = stack[index];
  if (current && JSON.stringify(current) === JSON.stringify(route)) return;
  stack = [...stack.slice(0, index + 1), route].slice(-100);
  index = stack.length - 1;
  emit();
}

/** Changes the current screen without adding a history step (e.g. switching tabs). */
export function replaceRoute(route: Route): void {
  stack[index] = route;
  emit();
}

export function back(): void {
  if (index > 0) {
    index--;
    emit();
  }
}

export function forward(): void {
  if (index < stack.length - 1) {
    index++;
    emit();
  }
}

export function resetNavigation(route: Route = { screen: 'inbox' }): void {
  stack = [route];
  index = 0;
  emit();
}

export function useRoute(): { route: Route; canBack: boolean; canForward: boolean } {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return { route: stack[index] ?? { screen: 'inbox' }, canBack: index > 0, canForward: index < stack.length - 1 };
}
