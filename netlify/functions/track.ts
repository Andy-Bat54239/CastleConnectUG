import index from '../../content/index.json'
import { blobPlayerStore } from '../../src/lib/blobStore'
import { handleTrack } from '../../src/lib/statsHandlers'

/** POST /api/track: a phone reports its progress picture (see src/lib/stats.ts). */
export default (req: Request): Promise<Response> => handleTrack(req, blobPlayerStore(), Date.now(), index.length)

export const config = { path: '/api/track' }
