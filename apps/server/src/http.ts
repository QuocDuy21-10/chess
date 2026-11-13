import cors from 'cors';
import express, { type ErrorRequestHandler, type RequestHandler, type Router } from 'express';
import helmet from 'helmet';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * The HTTP side of the server: security headers, CORS for the site, small JSON bodies, a guard against
 * cross-site requests, a health check, the given routes, and JSON for everything else.
 */
export function createHttpApp(origins: string[] | true = true, routes: Router[] = []) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: origins, credentials: true })); // credentials: the site's fetch sends the sid cookie
  app.use(express.json({ limit: '1kb' }));
  app.use(sameSiteOnly(origins));
  // A liveness check for the host's load balancer. It reads no state.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  for (const router of routes) app.use(router);
  app.use((_req, res) => {
    res.status(404).json({ error: 'not-found' });
  });
  app.use(onError);
  return app;
}

/**
 * Refuses a request that changes something unless it comes from one of the site's origins. With the SameSite=Lax
 * cookie, this closes cross-site request forgery. Development (any origin) lets everything through.
 */
export function sameSiteOnly(origins: string[] | true): RequestHandler {
  return (req, res, next) => {
    if (origins === true || !UNSAFE.has(req.method)) return next();
    const origin = req.get('origin');
    if (origin && origins.includes(origin)) return next();
    res.status(403).json({ error: 'forbidden' });
  };
}

/**
 * A client's mistake that Express or body-parser caught (bad JSON, a body too large) keeps its 4xx status.
 * Anything else is logged and answered without its details, which may name files or data.
 */
export const onError: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) return next(error); // the response has started: only Express can end it
  const status: unknown = error?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return void res.status(status).json({ error: 'bad-request' });
  }
  console.error(error);
  res.status(500).json({ error: 'internal' });
};
