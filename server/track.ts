import index from '../content/index.json'
import { trackRoute } from '../src/lib/statsRoutes'

/** POST /api/track: a phone reports its progress picture (see src/lib/stats.ts). Bundled into api/track.js by scripts/build-api.ts. */
export default {
  fetch: (request: Request): Promise<Response> => trackRoute(request, process.env, index.length),
}
