import { execFileSync } from 'node:child_process';
import { MAIN_REGIONS } from '../src/game/data/regions';
import { getMonster, SPECIAL_EGG_POOL } from '../src/game/data/monsters';

// 生物资源替换后运行：npx tsx tools/generate-ecology-art.ts（需要 Python Pillow）。
const ids = [...new Set(Object.values(MAIN_REGIONS).flatMap(region =>
  [...region.basePool, ...region.evo1Pool, ...region.evo2Pool, ...SPECIAL_EGG_POOL]))];
const sources = ids.map(id => ({ id, image: getMonster(id).image }));
execFileSync('python', ['-c', `
import json, sys
from pathlib import Path
from PIL import Image
output = Path('public/ecology')
output.mkdir(exist_ok=True)
for source in json.load(sys.stdin):
    image = Image.open(Path('public') / source['image'].lstrip('/')).convert('RGBA')
    image.thumbnail((128, 128), Image.Resampling.NEAREST)
    image.save(output / (source['id'] + '.png'), optimize=True)
`], { input: JSON.stringify(sources), stdio: ['pipe', 'inherit', 'inherit'] });
console.log(`Generated ${sources.length} ecology thumbnails`);
