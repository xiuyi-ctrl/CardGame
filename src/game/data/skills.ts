import type { SkillDef } from '../types';

export const SKILLS: Record<string, SkillDef> = {
  punch: {
    id: 'punch', name: '爪击', desc: '攻击单个敌人',
    target: 'single', kind: 'attack', power: 1.0,
  },
  tail: {
    id: 'tail', name: '尾扫', desc: '攻击所有敌人，伤害降低',
    target: 'all', kind: 'attack', power: 0.5,
  },
  bite: {
    id: 'bite', name: '撕咬', desc: '重击单个敌人',
    target: 'single', kind: 'attack', power: 1.4,
  },
  ember: {
    id: 'ember', name: '火花', desc: '火焰攻击，附加灼烧',
    target: 'single', kind: 'attack', power: 1.2, element: 'fire',
    effects: [{ kind: 'burn', value: 2, turns: 2 }],
  },
  aqua_shot: {
    id: 'aqua_shot', name: '水弹', desc: '水流攻击',
    target: 'single', kind: 'attack', power: 1.2, element: 'water',
  },
  leaf_needle: {
    id: 'leaf_needle', name: '叶针', desc: '连续两次攻击随机敌人',
    target: 'random', kind: 'attack', power: 0.6, hits: 2, element: 'nature',
  },
  shadow_claw: {
    id: 'shadow_claw', name: '暗爪', desc: '暗影攻击',
    target: 'single', kind: 'attack', power: 1.3, element: 'shadow',
  },
  steel_spike: {
    id: 'steel_spike', name: '铁刺', desc: '钢铁攻击，降低目标攻击',
    target: 'single', kind: 'attack', power: 1.1, element: 'metal',
    effects: [{ kind: 'atkDown', value: 0.5, turns: 2 }],
  },
  heal_light: {
    id: 'heal_light', name: '愈光', desc: '治疗一个队友',
    target: 'ally', kind: 'heal', power: 1.2, bonus: 3,
  },
  roar: {
    id: 'roar', name: '战吼', desc: '提升自身攻击',
    target: 'self', kind: 'buff', power: 0,
    effects: [{ kind: 'atkUp', value: 0.5, turns: 2 }],
  },
  double_hit: {
    id: 'double_hit', name: '连击', desc: '连续两次攻击单个敌人',
    target: 'single', kind: 'attack', power: 0.7, hits: 2,
  },
  poison_sting: {
    id: 'poison_sting', name: '毒刺', desc: '攻击并施加中毒',
    target: 'single', kind: 'attack', power: 0.8,
    effects: [{ kind: 'poison', value: 2, turns: 3 }],
  },
  flame_burst: {
    id: 'flame_burst', name: '烈焰爆发', desc: '火焰攻击所有敌人',
    target: 'all', kind: 'attack', power: 0.9, element: 'fire',
    effects: [{ kind: 'burn', value: 2, turns: 2 }],
  },
  dark_shock: {
    id: 'dark_shock', name: '暗影冲击', desc: '暗影重击',
    target: 'single', kind: 'attack', power: 1.6, element: 'shadow',
  },
};

export function getSkill(id: string): SkillDef {
  const s = SKILLS[id];
  if (!s) throw new Error(`未知技能: ${id}`);
  return s;
}
