// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { makeUnit } from '../src/game/core/battle';
import { getSkill } from '../src/game/data/skills';
import { createInitialState } from '../src/game/state/reducer';
import { STATUS_ART, BATTLE_BUFF_ART, CURSE_ART } from '../src/ui/BuffIcon';
import { BuffDetailPanel, CurseBadge, SkillTag, UnitCard, skillBrief } from '../src/ui/components';
import { PostBattleRosterScreen } from '../src/ui/App';
import type { StatusEffect, Unit } from '../src/game/types';

afterEach(cleanup);

function buffedUnit() {
  const unit = makeUnit('momo', true, 0, false);
  unit.shield = 4;
  unit.statuses = (Object.keys(STATUS_ART) as StatusEffect['kind'][]).map((kind) => ({ kind, value: 3, turns: 2, sealedSkills: ['punch'] }));
  unit.battleBuffs = { atkUp: 2, atkDown: 2, spdUp: 2, spdDown: 2, skillSpd: 1 };
  unit.curse = 'hpDown';
  return unit;
}

function sources(container: HTMLElement) {
  return Array.from(container.querySelectorAll('.buff-art-icon')).map((image) => image.getAttribute('src'));
}

describe('各界面共用状态像素图标', () => {
  it('通用生物卡覆盖全部状态、战斗加成和诅咒，保留数值', () => {
    const { container } = render(createElement(UnitCard, { unit: buffedUnit(), showSkills: false, topStats: true }));
    const images = sources(container);
    for (const [, file] of [...Object.values(STATUS_ART), ...Object.values(BATTLE_BUFF_ART), CURSE_ART.hpDown]) {
      expect(images).toContain(`/buff-icons/${file}.png`);
    }
    expect(container.querySelector('.statuses')?.textContent).toContain('×3');
    expect(container.querySelector('.battle-buffs')?.textContent).toContain('+1');
    expect(container.querySelector('.curse-badge')?.textContent).toContain('血脆');
  });

  it.each(['hpDown', 'atkDown', 'spdDown'] as const)('%s 诅咒标签使用对应独立素材', (curse) => {
    const unit: Unit = { ...makeUnit('momo', true, 0, false), curse };
    const { container } = render(createElement(CurseBadge, { unit }));
    expect(sources(container)).toEqual([`/buff-icons/${CURSE_ART[curse][1]}.png`]);
  });

  it('状态详情不限制三个图标，封印技能名、层数和回合仍可查看', () => {
    const { container } = render(createElement(BuffDetailPanel, { unit: buffedUnit() }));
    for (const [, file] of Object.values(STATUS_ART)) expect(sources(container)).toContain(`/buff-icons/${file}.png`);
    expect(screen.getByText('技能封印')).toBeTruthy();
    expect(container.textContent).toContain('技能封印：爪击');
    expect(container.textContent).toContain('灼烧 ×3');
    expect(container.textContent).toContain('2回合');
    expect(sources(container)).toContain('/buff-icons/potion-spd-up.png');
  });

  it('技能标签中的附加效果使用像素图标，数值简述保持纯数字', () => {
    const { container } = render(createElement(SkillTag, { skill: getSkill('ember'), desc: true }));
    expect(sources(container)).toEqual(['/buff-icons/burn.png']);
    expect(container.textContent).toContain('火花');
    expect(container.textContent).toContain('灼烧2层');
    expect(skillBrief(getSkill('shield_skill'))).toBe('5');
  });

  it('战后伙伴详情的独立诅咒提示也使用像素图标', () => {
    const unit = buffedUnit();
    const state = { ...createInitialState(), screen: 'roster' as const, postBattle: true, roster: [unit], field: [unit.uid] };
    const { container } = render(createElement(PostBattleRosterScreen, { state, dispatch: vi.fn() }));
    expect(container.querySelector('.postbattle-curse .buff-art-icon')?.getAttribute('src')).toBe('/buff-icons/curse-hp-down.png');
  });
});
