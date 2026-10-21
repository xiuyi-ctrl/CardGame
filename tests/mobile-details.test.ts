// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, Fragment, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MobileDetails, MobileUnitAbilities } from '../src/ui/MobileDetails';
import { MobileShell } from '../src/ui/mobile';
import { createInitialState } from '../src/game/state/reducer';
import { makeUnit } from '../src/game/core/battle';

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('手机按需详情', () => {
  it('仅手机收起说明，打开后完整显示，Escape 恢复触发按钮焦点', () => {
    render(createElement(MobileDetails, { label: '效果详情', summary: '伤害5', children: createElement('p', null, '完整条件：目标已灼烧时额外伤害2') }));
    expect(screen.queryByText(/完整条件/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '效果详情' }));
    expect(screen.getByRole('dialog').textContent).toContain('目标已灼烧时额外伤害2');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭效果详情' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '效果详情' }));
  });
  it('电脑端保留原节点和全文，不新增包装与入口', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const { container } = render(createElement(MobileDetails, { label: '详情', children: createElement('p', { className: 'original' }, '原说明') }));
    expect(container.innerHTML).toBe('<p class="original">原说明</p>');
  });
  it('原始选择与信息分离，关闭详情不改变选中对象', () => {
    function Example() {
      const [selected, setSelected] = useState('迅迅');
      return createElement(Fragment, null, createElement('button', { onClick: () => setSelected('泡泡') }, '选择泡泡'),
        createElement('span', { 'data-testid': 'selection' }, selected), createElement(MobileDetails, { label: '伙伴详情', children: selected }));
    }
    render(createElement(Example));
    fireEvent.click(screen.getByRole('button', { name: '选择泡泡' }));
    fireEvent.click(screen.getByRole('button', { name: '伙伴详情' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭伙伴详情' }));
    expect(screen.getByTestId('selection').textContent).toBe('泡泡');
  });
  it('Android 返回优先关闭详情，不打开菜单或派发游戏动作', () => {
    const dispatch = vi.fn();
    render(createElement(Fragment, null, createElement(MobileShell, { state: createInitialState(), dispatch, canSave: false }),
      createElement(MobileDetails, { label: '伙伴详情', children: '被动完整说明' })));
    fireEvent.click(screen.getByRole('button', { name: '伙伴详情' }));
    act(() => window.dispatchEvent(new Event('petcard-back')));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('技能详情保留完整条件、强化、次数和冷却，不显示进化信息', () => {
    const unit = { ...makeUnit('nine_tail_sovereign', true, 0, false), skills: ['flame_tail_shield', 'burn_tail'] };
    render(createElement(MobileUnitAbilities, { unit }));
    expect(document.body.textContent).toContain('冷却1回合');
    expect(document.body.textContent).toContain('每场限1次');
    expect(document.body.textContent).toContain('狐火');
    expect(document.body.textContent).not.toContain('下一形态');
  });

  it('描述未写面板数值的技能仍明确显示伤害与攻击目标', () => {
    render(createElement(MobileUnitAbilities, { unit: makeUnit('momo', true, 0, false) }));
    expect(screen.getByRole('heading', { name: '爪击 5' })).toBeTruthy();
    expect(document.body.textContent).toContain('敌方单体');
  });
});
