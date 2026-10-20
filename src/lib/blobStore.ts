import { getStore } from '@netlify/blobs'
import type { PlayerStore } from './statsHandlers'
import type { PlayerRecord } from './stats'

/** The player records, kept in Netlify Blobs (built into Netlify; nothing to set up). Only the Netlify functions import this. */
export function blobPlayerStore(): PlayerStore {
  const store = getStore('players')
  return {
    async get(id) {
      return ((await store.get(id, { type: 'json', consistency: 'strong' })) as PlayerRecord | null) ?? null
    },
    async set(id, record) {
      await store.setJSON(id, record)
    },
    async all() {
      const out: PlayerRecord[] = []
      for await (const page of store.list({ paginate: true })) {
        // read in small batches so a few hundred players never open hundreds of connections at once
        for (let i = 0; i < page.blobs.length; i += 20) {
          const batch = await Promise.all(page.blobs.slice(i, i + 20).map((b) => store.get(b.key, { type: 'json', consistency: 'strong' })))
          for (const r of batch) if (r) out.push(r as PlayerRecord)
        }
      }
      return out
    },
  }
}
