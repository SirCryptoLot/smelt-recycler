// lib/ecosystem.ts
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from './paths';

const PATH = path.join(DATA_DIR, 'ecosystem.json');

export interface EcosystemData {
  totalWallets: number;
  totalAccountsClosed: number;
  totalSolReclaimed: number;
  totalSmeltMinted: number;
  lastUpdated: string;
}

function load(): EcosystemData {
  try {
    if (!fs.existsSync(PATH)) return {
      totalWallets: 0, totalAccountsClosed: 0,
      totalSolReclaimed: 0, totalSmeltMinted: 0,
      lastUpdated: new Date().toISOString(),
    };
    return JSON.parse(fs.readFileSync(PATH, 'utf-8')) as EcosystemData;
  } catch {
    return { totalWallets: 0, totalAccountsClosed: 0, totalSolReclaimed: 0, totalSmeltMinted: 0, lastUpdated: new Date().toISOString() };
  }
}

function save(data: EcosystemData): void {
  try { fs.writeFileSync(PATH, JSON.stringify(data, null, 2)); } catch { /* non-blocking */ }
}

export function recordRecycle(accountsClosed: number, solReclaimed: number, smeltMinted: number): void {
  const data = load();
  data.totalAccountsClosed += accountsClosed;
  data.totalSolReclaimed += solReclaimed;
  data.totalSmeltMinted += smeltMinted;
  data.lastUpdated = new Date().toISOString();
  save(data);
}

export function incrementWalletCount(): void {
  const data = load();
  data.totalWallets += 1;
  data.lastUpdated = new Date().toISOString();
  save(data);
}

export function getEcosystem(): EcosystemData {
  return load();
}
