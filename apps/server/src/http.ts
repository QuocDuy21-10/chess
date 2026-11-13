import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';

/** The HTTP side of the server: security headers, a health check, and JSON for everything else. */
export function createHttpApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  // A liveness check for the host's load balancer. It reads no state.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use((_req, res) => {
    res.status(404).json({ error: 'not-found' });
  });
  app.use(onError);
  return app;
}

/** Logs the error and answers without its details, which may name files or data. */
export const onError: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) return next(error); // the response has started: only Express can end it
  console.error(error);
  res.status(500).json({ error: 'internal' });
};
