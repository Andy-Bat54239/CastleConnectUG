import index from '../content/index.json'
import { statsRoute } from '../src/lib/statsRoutes'

/** GET /api/stats: the totals, for whoever holds the STATS_KEY set in Vercel's environment variables. Bundled into api/stats.js by scripts/build-api.ts. */
export default {
  fetch: (request: Request): Promise<Response> => statsRoute(request, process.env, index.map((e) => e.title)),
}
