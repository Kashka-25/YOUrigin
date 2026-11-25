import { screenName } from '../../db/buildNotes';

// The screen you were on before opening Build notes, so a note can say where you saw it.
const KEY = 'yourigin.lastScreen';

export function rememberScreen(path: string) {
  if (path.startsWith('/build-notes')) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* private mode */
  }
}

export function lastScreen(): string {
  try {
    const p = sessionStorage.getItem(KEY);
    return p ? screenName(p) : '';
  } catch {
    return '';
  }
}
