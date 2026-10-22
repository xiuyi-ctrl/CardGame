import { readFileSync } from 'node:fs';
import { parse, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

function declarations(file: string, selector: string) {
  const sheet = parse(readFileSync(new URL(`../src/ui/${file}`, import.meta.url), 'utf8'));
  const result: Record<string, string> = {};
  sheet.walkRules((rule: Rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls(decl => { result[decl.prop] = decl.value; });
  });
  return result;
}

describe('技能区域滚动条样式', () => {
  it('战斗技能栏隐藏滚动条但仍允许滚动', () => {
    const selector = '.battle-sidebar .battle-skill-scroll';
    expect(declarations('styles.css', selector)).toMatchObject({ 'overflow-y': 'auto', 'scrollbar-width': 'none' });
    expect(declarations('styles.css', `${selector}::-webkit-scrollbar`).display).toBe('none');
    expect(declarations('mobile.css', `.mobile-ui ${selector}`)['overflow-y']).toBe('auto');
  });

  it('瞭望塔详情仅隐藏正文滚动条，保留共享详情的滚动规则', () => {
    const selector = '.watchtower-detail-overlay .enemy-inspect-modal .enemy-skill-panel';
    const details = declarations('remainingMain.css', selector);
    expect(details['scrollbar-width']).toBe('none');
    expect(details.overflow).toBeUndefined();
    expect(details['overflow-y']).toBeUndefined();
    expect(declarations('remainingMain.css', `${selector}::-webkit-scrollbar`).display).toBe('none');
  });
});
