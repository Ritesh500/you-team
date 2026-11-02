// Vercel serverless entry: the whole Express API runs as one function.
// vercel.json rewrites /api/* and /health here; Express still sees the
// original path, so the app's own routing is unchanged.
// server/dist is produced by the build command (see vercel.json).
import { createApp } from '../server/dist/app.js';

export default createApp();
