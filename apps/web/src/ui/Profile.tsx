'use client';

import type { HistoryEntry } from '@chess/shared/account';
import { useEffect, useState, type FormEvent } from 'react';
import { useAccount } from '@/net/account';
import { TEAM } from '@/scene/theme';
import { useSettings } from '@/state/settings';
import { resultText, useT, type Strings } from './i18n';

const primary = 'min-h-11 rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500 disabled:opacity-50';
const secondary = 'min-h-11 rounded-lg border border-stone-600 px-4 py-2 hover:bg-stone-800 disabled:opacity-50';

/** Win, loss or draw, from the side of the player whose history this is. */
function outcome(t: Strings, game: HistoryEntry): string {
  if (!('winner' in game.result)) return t.outcome.draw;
  return game.result.winner === game.color ? t.outcome.win : t.outcome.loss;
}

const signed = (delta: number) => (delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '±0');

/** The player's name, which they can change, and their finished online games, newest first. */
export function ProfilePanel({ onBack }: { onBack: () => void }) {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const user = useAccount((s) => s.user);
  const rename = useAccount((s) => s.rename);
  const history = useAccount((s) => s.history);
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState<'idle' | 'busy' | 'saved' | 'refused'>('idle');
  const [games, setGames] = useState<HistoryEntry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true; // the panel may close before the first page arrives
    history().then(
      (page) => {
        if (!live) return;
        setGames(page.games);
        setNext(page.next);
        setLoading(false);
      },
      () => {
        if (!live) return;
        setFailed(true);
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [history]);

  async function loadMore() {
    if (!next) return;
    setLoading(true);
    try {
      const page = await history(next);
      setGames((earlier) => [...earlier, ...page.games]);
      setNext(page.next);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving('busy');
    setSaving((await rename(name)) ? 'saved' : 'refused');
  }

  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' });

  return (
    <>
      <form onSubmit={save} className="flex flex-col gap-2">
        <label htmlFor="display-name" className="text-sm text-stone-300">
          {t.displayName}
        </label>
        <div className="flex gap-2">
          <input
            id="display-name"
            autoFocus
            value={name}
            maxLength={64} // the server counts characters; this only stops a runaway paste
            aria-describedby="name-rule"
            aria-invalid={saving === 'refused'}
            onChange={(event) => {
              setName(event.target.value);
              setSaving('idle');
            }}
            className="min-h-11 min-w-0 flex-1 rounded-lg bg-stone-800 px-3 py-2 text-stone-100 aria-invalid:outline aria-invalid:outline-red-400"
          />
          <button type="submit" disabled={saving === 'busy'} className={primary}>
            {saving === 'saved' ? t.saved : t.save}
          </button>
        </div>
        <p id="name-rule" role={saving === 'refused' ? 'alert' : undefined} className={`text-sm ${saving === 'refused' ? 'text-red-400' : 'text-stone-400'}`}>
          {t.nameRule}
        </p>
      </form>

      <section aria-labelledby="history-title" className="flex flex-col gap-2">
        <h2 id="history-title" className="text-sm text-stone-300">
          {t.matchHistory}
        </h2>
        {failed && (
          <p role="alert" className="text-sm text-red-400">
            {t.historyError}
          </p>
        )}
        {!loading && !failed && games.length === 0 && <p className="text-sm text-stone-400">{t.noGames}</p>}
        <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {games.map((game) => (
            <li key={game.id} className="flex items-center gap-3 rounded-lg bg-stone-800 px-3 py-2 text-sm">
              <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: TEAM[game.color] }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {outcome(t, game)} · {game.opponent.name}
                </span>
                <span className="block truncate text-stone-400">
                  {resultText(t, game.result)} · {t.minutes(game.minutes)} · {date.format(new Date(game.endedAt))}
                </span>
              </span>
              <span className="font-mono">{signed(game.delta)}</span>
            </li>
          ))}
        </ul>
        {loading && (
          <p role="status" className="text-sm text-stone-400">
            {t.loadingHistory}
          </p>
        )}
        {next && !loading && (
          <button onClick={loadMore} className={secondary}>
            {t.loadMore}
          </button>
        )}
      </section>

      <button onClick={onBack} className={secondary}>
        {t.back}
      </button>
    </>
  );
}
