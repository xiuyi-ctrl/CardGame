import { readFileSync } from 'node:fs';
import { parse, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

const sheet = parse(readFileSync(new URL('../src/ui/mobile.css', import.meta.url), 'utf8'));

/** 只取横屏通用覆盖；竖屏兜底不参与。此处检查级联约束，不冒充浏览器布局测量。 */
function declarations(selector: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const node of sheet.nodes) {
    if (node.type !== 'rule' || !(node as Rule).selectors.includes(selector)) continue;
    node.walkDecls(decl => { result[decl.prop] = decl.value; });
  }
  return result;
}

describe('手机开局页面布局约束', () => {
  it('首页重置桌面场景最小高度、双行网格和60px菜单固定尺寸', () => {
    expect(declarations('.mobile-ui .home-world')['min-height']).toBe('0');
    expect(declarations('.mobile-ui .home-shell')).toMatchObject({ height: '100%', 'min-height': '0', 'grid-template-rows': 'minmax(0, 1fr)' });
    expect(declarations('.mobile-ui .home-menu')['grid-template-rows']).toBe('repeat(4, minmax(44px, 1fr)) 8px minmax(44px, 1fr)');
    expect(declarations('.mobile-ui .home-action').height).toBe('100%');
    expect(declarations('.mobile-ui .home-menu-secondary button').height).toBe('100%');
  });

  it('难度页保持横向主区，卡片和图片可收缩，底部下一步单独占行', () => {
    expect(declarations('.mobile-ui .difficulty-screen')).toMatchObject({ display: 'grid', overflow: 'hidden', 'grid-template-rows': 'var(--mobile-header) minmax(0, 1fr) clamp(64px, 18dvh, 76px)' });
    expect(declarations('.mobile-ui .difficulty-main').display).toBe('grid');
    expect(declarations('.mobile-ui .difficulty-choices')['min-height']).toBe('0');
    expect(declarations('.mobile-ui .difficulty-tablet')).toMatchObject({ height: '100%', 'min-height': '0' });
    expect(declarations('.mobile-ui .difficulty-art')['min-height']).toBe('0');
    expect(declarations('.mobile-ui .difficulty-next')['min-height']).toBe('44px');
    expect(declarations('.mobile-ui .relic-grid')['overflow-y']).toBe('auto');
  });

  it('选宠页显式恢复网格与弹性填充，立绘无位移，只有详情正文滚动', () => {
    expect(declarations('.mobile-ui .starter-select-layout')).toMatchObject({ display: 'grid', flex: '1', 'min-height': '0' });
    expect(declarations('.mobile-ui .starter-select-world')['min-height']).toBe('0');
    expect(declarations('.mobile-ui .starter-select-pet img')).toMatchObject({ transform: 'none', 'max-height': '100%', 'object-fit': 'contain' });
    expect(declarations('.mobile-ui .starter-select-panel')).toMatchObject({ display: 'grid', 'grid-template-rows': 'auto minmax(0, 1fr) 44px auto', overflow: 'hidden' });
    expect(declarations('.mobile-ui .starter-select-abilities')['overflow-y']).toBe('auto');
    expect(declarations('.mobile-ui .starter-select-confirm')['min-height']).toBe('44px');
  });

  it('手机尺寸采用有上下限的视口单位，不对整页应用缩放而缩小触点', () => {
    const root = declarations('html.mobile-ui');
    expect(root['--mobile-gap']).toContain('dvh');
    expect(root['--mobile-heading']).toContain('clamp(');
    expect(root['--mobile-header']).toContain('dvh');
    expect(declarations('.mobile-ui #root').transform).toBeUndefined();
    expect(declarations('.mobile-ui #root').zoom).toBeUndefined();
  });
});

describe('全界面手机布局约束', () => {
  it('手机队伍的融合、释放、净化共享一行网格，不让嵌套工具栏挤占单格', () => {
    expect(declarations('.mobile-ui .ordinary-detail-actions')['grid-template-columns']).toBe('repeat(3, minmax(0, 1fr))');
    expect(declarations('.mobile-ui .ordinary-detail-actions .unit-card-actions').display).toBe('contents');
  });
  it('布阵显式重置窄窗口的纵向布局和桌面最小高度', () => {
    expect(declarations('.mobile-ui .formation-main')).toMatchObject({ display: 'grid', 'min-height': '0', 'grid-template-rows': 'minmax(0, 1fr)' });
    expect(declarations('.mobile-ui .formation-left')['min-height']).toBe('0');
    expect(declarations('.mobile-ui .formation-board')['min-height']).toBe('0');
    expect(declarations('.mobile-ui .formation-list')['grid-template-rows']).toContain('44px');
  });

  it('商店四件商品两列两行，效果说明可点开，购买按钮独立', () => {
    expect(declarations('.mobile-ui .shop-stock')).toMatchObject({ 'grid-template-columns': 'repeat(2, minmax(0, 1fr))', 'grid-template-rows': 'repeat(2, minmax(0, 1fr))', overflow: 'hidden' });
    expect(declarations('.mobile-ui .shop-product')['min-height']).toBe('0');
    expect(declarations('.mobile-ui .shop-product p')['overflow-y']).toBe('visible');
    expect(declarations('.mobile-ui .shop-product .mobile-details-trigger').width).toBe('100%');
    expect(declarations('.mobile-ui .shop-product .shop-buy')).toMatchObject({ 'grid-area': '1 / 3', 'min-height': '44px' });
  });

  it('招募保持双列，名字与属性位于受限立绘右侧', () => {
    expect(declarations('.mobile-ui .recruit-candidate-list')['grid-template-columns']).toBe('repeat(2, minmax(0, 1fr))');
    expect(declarations('.mobile-ui .recruit-overview').display).toBe('grid');
    expect(declarations('.mobile-ui .recruit-portrait').height).toContain('dvh');
    expect(declarations('.mobile-ui .recruit-candidate')['grid-template-rows']).toContain('44px');
  });

  it('战后修整限制伙伴网格高度，详情正文与操作分离', () => {
    expect(declarations('.mobile-ui .postbattle-screen')['grid-template-rows']).toBe('auto minmax(0, 1fr)');
    expect(declarations('.mobile-ui .postbattle-roster-grid')['overflow-y']).toBe('auto');
    expect(declarations('.mobile-ui .postbattle-detail-body')).toMatchObject({ flex: 'none', display: 'grid', 'min-height': '0', 'overflow-y': 'auto' });
    expect(declarations('.mobile-ui .postbattle-detail').overflow).toBe('hidden');
  });

  it('熟练度竞技场保持三列，成长转移聚焦单栏且返回后恢复伙伴列表', () => {
    expect(declarations('.mobile-ui .proficiency-arena-options')['grid-template-columns']).toBe('repeat(3, minmax(0, 1fr))');
    expect(declarations('.mobile-ui .proficiency-arena-options')['grid-auto-rows']).toBe('minmax(0, 1fr)');
    expect(declarations('.mobile-ui .training-growth-layout.has-transfer')['grid-template-columns']).toBe('minmax(0, 1fr)');
    expect(declarations('.mobile-ui .training-growth-layout.has-transfer > :is(.training-roster, .training-growth-detail)').display).toBe('none');
  });

  it('地图保留情报，菜单使用标题栏预留空间，不覆盖战斗操作', () => {
    expect(declarations('.mobile-ui .map-screen .map-info').display).toBe('flex');
    expect(declarations('.mobile-ui .map-screen .map-track')['--mobile-node']).toContain('clamp(44px');
    expect(declarations('html.mobile-ui .battle-screen > .hud')['padding-right']).toBe('52px');
    expect(declarations('.mobile-ui .mobile-menu-toggle').height).toBe('44px');
  });

  it('成长弹窗与通用弹窗共享视口约束，正文和操作分离', () => {
    expect(declarations('.mobile-ui :is(.confirm-box, .overlay-box, .battle-overlay-panel, .save-mgmt-panel, .growth-modal)')['max-height']).toContain('100dvh');
    expect(declarations('.mobile-ui :is(.popup-body, .enemy-inspect-scroll, .battle-overlay-grid, .save-grid, .fusion-confirm-preview, .growth-modal-content, .scout-result)')['overflow-y']).toBe('auto');
  });

  it('手机自动提示只保留底部定位，避免同时约束上下边拉伸高度', () => {
    expect(declarations('.mobile-ui .toast')).toMatchObject({ top: 'auto', height: 'auto', 'min-height': '0' });
    expect(declarations('.mobile-ui .toast')['max-width']).toContain('100vw');
    expect(declarations('.mobile-ui .toast').animation).not.toContain('toast-in');
  });

  it('独立渲染验收夹具列举所有游戏 Screen，不进入生产入口', () => {
    expect(declarations('.mobile-ui .test-pick-screen .formation-board')['grid-template-rows']).toBe('repeat(2, minmax(120px, 1fr))');
    const game = readFileSync(new URL('../src/game/state/game.ts', import.meta.url), 'utf8');
    const screenType = game.slice(game.indexOf('export type Screen ='), game.indexOf('export interface RunStats'));
    const names = [...screenType.matchAll(/'([^']+)'/g)].map(match => match[1]);
    const fixtures = readFileSync(new URL('../tools/mobile-layout/preview.tsx', import.meta.url), 'utf8');
    for (const name of names) expect(fixtures, name).toContain(`add('${name}',`);
    expect(readFileSync(new URL('../src/ui/main.tsx', import.meta.url), 'utf8')).not.toContain('mobile-layout');
  });
});
