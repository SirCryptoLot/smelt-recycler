// instrumentation.ts — runs once on server startup (Next.js App Router)
// Creates data files with empty defaults if they don't exist yet.
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');

const DEFAULTS: Record<string, unknown> = {
  'fees.json': [],
  'donations.json': [],
  'referrals.json': [],
  'liquidations.json': [],
  'distributions.json': [],
  'ecosystem.json': {
    totalWallets: 0,
    totalAccountsClosed: 0,
    totalSolReclaimed: 0,
    totalSmeltMinted: 0,
  },
  'leaderboard.json': {
    weekly: { since: new Date().toISOString(), entries: [] },
    allTime: { entries: [] },
  },
};

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    for (const [filename, defaultValue] of Object.entries(DEFAULTS)) {
      const filepath = path.join(DATA_DIR, filename);
      if (!fs.existsSync(filepath)) {
        fs.writeFileSync(filepath, JSON.stringify(defaultValue, null, 2));
        console.log(`[init] Created ${filepath}`);
      }
    }
  }
}
