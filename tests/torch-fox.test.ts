// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { createBattle, makeUnit, playerSkill, playerEndTurn } from '../src/game/core/battle';
import { fuseUnit, fusionNeedCount } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { FusionConfirm } from '../src/ui/App';
import { ProgressionChoiceScreen } from '../src/ui/ProgressionScreens';
import { getSkill } from '../src/game/data/skills';
import { getNormalSkillPool, LEGENDARY_SKILLS } from '../src/game/core/growth';

function setup(skill: string, species = 'torch_fox_lord') {
  const b = createBattle([makeUnit(species, true, 0, false), makeUnit('lulu', true, 1, false)], [{ speciesId: 'kiki' }, { speciesId: 'kiki' }], 71);
  b.playerUnits = b.playerUnits.map((u, i) => ({ ...u, skills: i === 0 ? [skill] : [], spd: 99 - i, hp: 100, maxHp: 100 }));
  b.enemyUnits = b.enemyUnits.map(u => ({ ...u, skills: [], passive: undefined, hp: 100, maxHp: 100, acted: true }));
  return b;
}
const seed = { kind: 'emberSeed' as const, value: 1, turns: 0 };

describe('火狐分支与火种', () => {
  it('火狐自由选择两条分支，拒绝不合法的跨链进化', () => {
    const fox = makeUnit('fire_fox', true, 0, false);
    expect(fuseUnit(fox)?.speciesId).toBe('phantom_tail_fox');
    expect(fuseUnit(fox, 'torch_fox')?.speciesId).toBe('torch_fox');
    expect(fuseUnit(fox, 'torch_fox_lord')).toBeNull();
    expect(fuseUnit(makeUnit('torch_fox', true, 0, false))?.speciesId).toBe('torch_fox_lord');
    expect(fusionNeedCount('torch_fox')).toBe(2);
  });
  it('融合先选择方向，再确认材料并派发所选形态', () => {
    const a = makeUnit('fire_fox', true, 0, false), b = makeUnit('fire_fox', true, 1, false);
    const c = makeUnit('fire_fox', true, 2, false);
    const state = { ...createInitialState(), screen: 'roster' as const, roster: [a, b, c] };
    const dispatch = vi.fn();
    render(createElement(FusionConfirm, { primary: a, state, dispatch, onClose: vi.fn() }));
    expect(screen.getByRole('dialog', { name: '选择进化方向' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '选择幻尾火狐' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '确定融合' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '选择传火狐' }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '确认融合' })).toBeTruthy();
    expect(screen.queryByText('双尾狐焰')).toBeNull();
    expect(screen.getByText('传火之尾')).toBeTruthy();
    fireEvent.click(screen.getByText('确定融合'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'FUSE', primaryUid: a.uid, materialUids: [b.uid, c.uid], targetSpeciesId: 'torch_fox' });
    const next = gameReducer(state, dispatch.mock.calls[0][0]);
    expect(next.roster).toHaveLength(1);
    expect(next.roster[0].speciesId).toBe('torch_fox');
    cleanup();
  });
  it('传火给友方灼烧并授予火种，施法者免疫自然灼烧伤害', () => {
    const b = setup('pass_flame');
    b.playerUnits[0].statuses = [{ kind: 'burn', value: 8, turns: 2 }];
    const actor = b.playerUnits[0], ally = b.playerUnits[1];
    const after = playerEndTurn(playerSkill(b, actor.uid, 'pass_flame', ally.uid));
    expect(after.playerUnits[0].hp).toBe(100);
    expect(after.playerUnits[1].statuses.find(s => s.kind === 'emberSeed')?.value).toBe(1);
    expect(after.playerUnits[0].statuses.some(s => s.kind === 'emberSeed')).toBe(false);
  });
  it('群体传火不会叠加已有火种，火种跨回合保留', () => {
    const b = setup('relay_wildfire');
    b.playerUnits[0].statuses = [seed];
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'relay_wildfire'));
    for (const u of after.playerUnits) expect(u.statuses.find(s => s.kind === 'emberSeed')?.value).toBe(1);
    expect(after.playerUnits[0].skillCooldowns?.relay_wildfire).toBe(2);
  });
  it('火种只强化群攻首次命中，不重复作用到所有目标与所有段', () => {
    const b = setup('dragon_breath', 'torch_fox');
    b.playerUnits[0].statuses = [seed];
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'dragon_breath'));
    const hits = after.log.filter(e => e.actorUid === b.playerUnits[0].uid && e.text.includes('使用「龙息」攻击'));
    expect(hits).toHaveLength(4);
    const values = hits[3].statuses!;
    expect(values[b.enemyUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(6);
    expect(values[b.enemyUnits[1].uid].find(s => s.kind === 'burn')?.value).toBe(4);
    expect(after.playerUnits[0].statuses.some(s => s.kind === 'emberSeed')).toBe(false);
  });
  it('引燃仅消耗我方火种，按数量造成伤害，敌方火种不变', () => {
    const b = setup('ignite_embers');
    b.playerUnits.forEach(u => { u.statuses = [seed]; });
    b.enemyUnits[0].statuses = [seed];
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'ignite_embers', b.enemyUnits[0].uid));
    const hit = after.log.find(e => e.text.includes('使用「火种引燃」攻击'))!;
    expect(hit.hp?.[b.enemyUnits[0].uid]).toBe(96);
    expect(hit.statuses?.[b.enemyUnits[0].uid].some(s => s.kind === 'emberSeed')).toBe(true);
    for (const u of after.playerUnits) expect(u.statuses.some(s => s.kind === 'emberSeed')).toBe(false);
  });
  it('火幕对持有火种的友方提供4盾，其他友方2盾', () => {
    const b = setup('ember_veil');
    b.playerUnits[1].statuses = [seed];
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'ember_veil'));
    const log = after.log.find(e => e.text.includes('使用「火幕庇护」'))!;
    expect(log.shields?.[b.playerUnits[0].uid]).toBe(2);
    expect(log.shields?.[b.playerUnits[1].uid]).toBe(4);
  });
  it('新技能分类与冷却符合设计', () => {
    expect(getNormalSkillPool()).toContain('pass_flame');
    expect(getNormalSkillPool()).toContain('ember_veil');
    expect(LEGENDARY_SKILLS.has('relay_wildfire')).toBe(true);
    expect(LEGENDARY_SKILLS.has('ignite_embers')).toBe(true);
    expect(getSkill('ember_veil').cooldown).toBeUndefined();
  });
  it.each([false, true])('奇遇免费进化可指定传火分支，超进化=%s', superEvolution => {
    const fox = makeUnit('fire_fox', true, 0, false);
    const state = { ...createInitialState(), screen: 'roster' as const, roster: [fox], specialPending: { kind: 'evolve' as const, super: superEvolution } };
    const next = gameReducer(state, { type: 'EVOLVE_ONE', uid: fox.uid, targetSpeciesId: 'torch_fox' });
    expect(next.roster[0].speciesId).toBe('torch_fox');
    expect(next.screen).toBe('map');
    expect(!!next.roster[0].curse).toBe(superEvolution);
    expect(gameReducer(state, { type: 'EVOLVE_ONE', uid: fox.uid, targetSpeciesId: 'torch_fox_lord' })).toBe(state);
  });
  it('奇遇分支需选择后确认，点火狐卡片不会提前进化', () => {
    const fox = makeUnit('fire_fox', true, 0, false);
    const state = { ...createInitialState(), screen: 'roster' as const, roster: [fox], specialPending: { kind: 'evolve' as const, super: false } };
    const dispatch = vi.fn();
    render(createElement(ProgressionChoiceScreen, { state, dispatch }));
    fireEvent.click(screen.getByRole('button', { name: /可进化/ }));
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('进化形态'), { target: { value: 'torch_fox' } });
    fireEvent.click(screen.getByText('确认进化'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'EVOLVE_ONE', uid: fox.uid, targetSpeciesId: 'torch_fox' });
    cleanup();
  });
  it('新战斗清除火种与被动计次，传奇分支第一幕仍受锁定', () => {
    const fox = { ...makeUnit('torch_fox', true, 0, false), flameRelayUsed: true, statuses: [seed] };
    const battle = createBattle([fox], [{ speciesId: 'momo' }], 3);
    expect(battle.playerUnits[0].statuses.some(s => s.kind === 'emberSeed')).toBe(false);
    expect(battle.playerUnits[0].flameRelayUsed).toBeUndefined();
    const other = makeUnit('torch_fox', true, 1, false);
    const state = { ...createInitialState(), screen: 'roster' as const, roster: [fox, other], act: 1 };
    expect(gameReducer(state, { type: 'FUSE', primaryUid: fox.uid, materialUid: other.uid })).toBe(state);
  });
});
