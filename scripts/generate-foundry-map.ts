// scripts/generate-foundry-map.ts
// Run from project root: npx ts-node --project tsconfig.json scripts/generate-foundry-map.ts
import path from 'path';
import fs from 'fs';
import { generateMap } from '../lib/foundry-map';

const MAP_PATH = path.join(process.cwd(), 'data', 'foundry-map.json');

function main() {
  if (fs.existsSync(MAP_PATH)) {
    console.log('foundry-map.json already exists — delete it first to regenerate');
    process.exit(0);
  }

  console.log('Generating 60×50 world map...');
  const map = generateMap();

  const traversable = map.tiles.flat().filter(t =>
    !['water', 'mountains', 'cliffs'].includes(t)
  ).length;

  console.log(`  Tiles: ${map.width}×${map.height} = ${map.width * map.height} total`);
  console.log(`  Traversable: ${traversable}`);
  console.log(`  Forge plots: ${map.forgePlots.length}`);

  if (map.forgePlots.length < 500) {
    console.error(`ERROR: Only placed ${map.forgePlots.length} forge plots (need 500). Adjust MIN_PLOT_SPACING.`);
    process.exit(1);
  }

  fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
  console.log(`Saved to ${MAP_PATH}`);
}

main();
