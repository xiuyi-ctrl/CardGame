import { describe, expect, it } from 'vitest';
import { buildEvent, generateMap } from '../src/game/state/game';

describe('相邻层事件降低重复权重', () => {
  it.each([1, 2, 3])('第%s幕上一层泉水的重复率明显降低，同时保留少量重复', act => {
    function count(previous: string[]) {
      let repeated = 0;
      for (let i = 0; i < 1000; i++) {
        let calls = 0;
        const event = buildEvent(() => calls++ === 0 ? (i + 0.5) / 1000 : 0.5, act, 'mixed', previous);
        if (event.title === '神秘泉水') repeated++;
      }
      return repeated;
    }
    const normal = count([]), reduced = count(['神秘泉水']);
    expect(reduced).toBeGreaterThan(0);
    expect(reduced).toBeLessThan(normal * 0.3);
  });

  it('两地区各幕地图仍确定、事件完整，序列化不重抽', () => {
    for (const region of ['mixed', 'emerald_forest'] as const) for (const act of [1, 2, 3]) {
      const map = generateMap(93, act, 'normal', region);
      expect(generateMap(93, act, 'normal', region)).toEqual(map);
      for (const node of map.layers.flat().filter(node => node.type === 'event')) {
        expect(map.events[node.id].choices.length).toBeGreaterThan(0);
      }
      expect(JSON.parse(JSON.stringify(map)).events).toEqual(map.events);
    }
  });
});
