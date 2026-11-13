import * as Sentry from '@sentry/node';

// One JSON line per event, so `docker compose logs server | jq` can read the server's output.
// `log.error` also reports to Sentry, which does nothing until index.ts starts it.

type Fields = Record<string, unknown>;

function line(level: 'info' | 'warn' | 'error', msg: string, fields: Fields = {}): string {
  const entry: Fields = { time: new Date().toISOString(), level, msg };
  for (const [key, value] of Object.entries(fields)) {
    try {
      JSON.stringify(value);
      entry[key] = value;
    } catch {
      entry[key] = '[unserializable]'; // a cycle or a BigInt must not cost the whole line
    }
  }
  return JSON.stringify(entry);
}

/** An Error as plain data (`code` is how `pg` and Node name what went wrong); anything else as text. */
function describe(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const { code } = error as { code?: unknown };
  return { message: error.message, stack: error.stack, ...(code === undefined ? {} : { code }) };
}

export const log = {
  info: (msg: string, fields?: Fields) => console.log(line('info', msg, fields)),
  warn: (msg: string, fields?: Fields) => console.log(line('warn', msg, fields)),
  error(msg: string, error?: unknown, fields?: Fields) {
    console.error(line('error', msg, error === undefined ? fields : { ...fields, error: describe(error) }));
    Sentry.captureException(error ?? new Error(msg), { extra: { msg, ...fields } });
  },
};
