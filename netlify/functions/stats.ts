import index from '../../content/index.json'
import { blobPlayerStore } from '../../src/lib/blobStore'
import { handleStats } from '../../src/lib/statsHandlers'

/** GET /api/stats: the totals, for whoever holds the STATS_KEY set in Netlify's environment variables. */
export default (req: Request): Promise<Response> => handleStats(req, blobPlayerStore(), process.env.STATS_KEY, Date.now(), index.length, index.map((e) => e.title))

export const config = { path: '/api/stats' }
