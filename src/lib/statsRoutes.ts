import { redisConfig, redisPlayerStore } from './redisStore'
import { handleStats, handleTrack, StorageMissing, type PlayerStore } from './statsHandlers'

/**
 * The two server routes with the environment plugged in: they find the database in the environment, and say plainly (503)
 * when there is none yet instead of failing in a confusing way. Vercel's two functions are thin wrappers around these.
 */

type Env = Record<string, string | undefined>

export const NO_DATABASE = 'The counter has no database yet. In Vercel, add an Upstash Redis store to this project (Storage tab) and redeploy. See the README, under "Counting players".'

const noStore: PlayerStore = {
  get: async () => {
    throw new StorageMissing(NO_DATABASE)
  },
  set: async () => {
    throw new StorageMissing(NO_DATABASE)
  },
  all: async () => {
    throw new StorageMissing(NO_DATABASE)
  },
}

function storeFor(env: Env, send?: typeof fetch): PlayerStore {
  const config = redisConfig(env)
  return config ? redisPlayerStore(config, send) : noStore
}

export function trackRoute(req: Request, env: Env, totalDays: number, now: number = Date.now(), send?: typeof fetch): Promise<Response> {
  return handleTrack(req, storeFor(env, send), now, totalDays)
}

export function statsRoute(req: Request, env: Env, titles: string[], now: number = Date.now(), send?: typeof fetch): Promise<Response> {
  return handleStats(req, storeFor(env, send), env.STATS_KEY, now, titles.length, titles)
}
