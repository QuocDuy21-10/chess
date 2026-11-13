import { createApp } from './app.ts';

// PORT: where to listen (3001). CLIENT_ORIGIN: the frontend's origin; when unset, any origin may connect.
createApp({ origin: process.env.CLIENT_ORIGIN })
  .listen(Number(process.env.PORT) || 3001)
  .then((port) => console.log(`Game server listening on port ${port}`));
