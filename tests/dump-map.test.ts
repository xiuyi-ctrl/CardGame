/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { generateMap, type MapNode } from '../src/game/state/game';
import { getMonster } from '../src/game/data/monsters';

const ICON: Record<string, string> = {
  battle: '⚔️',
  elite: '💀',
  rest: '🛌',
  shop: '🏪',
  event: '📜',
  special: '💎',
  boss: '👑',
  arena: '🗡️',
  gauntlet: '🔥',
  corrupted: '🌑',
  watchtower: '🔭',
};

function encounterText(map: ReturnType<typeof generateMap>, n: MapNode): string {
  if (n.type === 'boss') {
    const e = map.boss[n.id]?.[0];
    return e ? `${getMonster(e.speciesId).emoji} ${getMonster(e.speciesId).name} Lv${e.level}（首领）` : '—';
  }
  const e = map.encounter[n.id];
  if (!e) return '—';
  return e.map((x) => `${getMonster(x.speciesId).emoji} ${getMonster(x.speciesId).name} Lv${x.level}`).join('、');
}

function contentText(map: ReturnType<typeof generateMap>, n: MapNode): string {
  switch (n.type) {
    case 'battle':
    case 'elite':
    case 'boss':
      return encounterText(map, n);
    case 'shop':
      return '购物；或花 5 金币立即休整（回满血·不解诅咒，购物后不可休整）';
    case 'rest':
      return '休整：全队回满血（旧档兼容）';
    case 'event': {
      const ev = map.events[n.id];
      if (!ev) return '—';
      return `${ev.title}｜${ev.choices.map((c) => `${c.label}（${c.desc}）`).join(' ／ ')}`;
    }
    case 'special': {
      const sp = map.specials[n.id];
      if (!sp) return '—';
      return `${sp.title}｜${sp.rewards.map((r, i) => `${i + 1}.${r.label}：${r.desc}`).join(' ／ ')}`;
    }
    case 'watchtower':
      return '瞭望塔：可预览下 3 行内某一行的全部节点情报';
    default:
      return '—';
  }
}

function buildMd(seed: number): string {
  const lines: string[] = [];
  lines.push(`# 驯牌远征 · 关卡情报（seed=${seed}）`);
  lines.push('');
  lines.push('> 由 `tests/dump-map.test.ts` 生成，包含每幕全部节点的类型、位置与遭遇信息。');
  lines.push('> 可用 `npm run dump-map`（环境变量 `DUMP_SEED` 指定种子）重新生成。');
  lines.push('');
  for (let act = 1; act <= 3; act++) {
    const map = generateMap(seed, act);
    lines.push(`## 第 ${act} 幕`);
    lines.push('');
    lines.push(`- 层数：**${map.layers.length}**；中间行每层 **3~5** 个节点；第 1 行（出发）为单战斗节点，最后 1 行为 **2~3 个首领节点**。`);
    lines.push('');
    for (let row = 0; row < map.layers.length; row++) {
      const isFirst = row === 0;
      const isLast = row === map.layers.length - 1;
      lines.push(`### ${row + 1} 层（${isFirst ? '出发' : isLast ? '首领' : `中间层${map.layers[row].length} 节点`}）`);
      lines.push('');
      lines.push('| 列 | 类型 | 名称 | 内容 |');
      lines.push('|:--:|:--|:--|:--|');
      for (const n of map.layers[row]) {
        lines.push(`| ${n.col} | ${ICON[n.type]} ${n.type} | ${n.label} | ${contentText(map, n)} |`);
      }
      lines.push('');
    }
  }
  lines.push('---');
  lines.push('> 术语：`battle` 遭遇战、`elite` 精英怪、`shop` 商人（含立即休整）、`event` 事件、`special` 奇遇关、`boss` 首领。');
  return lines.join('\n');
}

describe('生成关卡情报 MD 文件', () => {
  it('为指定种子生成包含全部节点信息的 MD 文件', () => {
    const seed = Number(process.env.DUMP_SEED ?? 2000);
    const md = buildMd(seed);
    const dir = path.join(process.cwd(), 'dump');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `驯牌远征-关卡-seed${seed}.md`);
    fs.writeFileSync(file, md, 'utf8');
    const stat = fs.statSync(file);
    expect(stat.size).toBeGreaterThan(1000);
    expect(md).toContain('精英怪');
    expect(md).toContain('奇遇关');
    expect(md).toContain('首领');
  });
});
