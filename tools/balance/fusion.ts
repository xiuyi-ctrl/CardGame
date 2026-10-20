import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BASE_POOL, EVO1_POOL, getMonster } from '../../src/game/data/monsters';
import { fusionEncounters, FUSION_POLICIES, FUSION_VARIANTS, fusionStatBudget, simulateFusionTrial, type FusionTrial } from '../../src/game/simulation/fusion-assessment';

const seeds = Number(process.argv[2] ?? 20);
if (!Number.isInteger(seeds) || seeds < 1 || seeds > 1000) throw new Error('种子数量应为 1–1000 的整数');
const species = [...BASE_POOL, ...EVO1_POOL];
const runs: FusionTrial[] = [];
const seedStart = 2000;
const variantLabels = { before: '不融合', empty: '融合无替补', damage: '融合+输出替补', healer: '融合+治疗替补' };
const policyLabels = { greedy: '原贪心', lookahead: '一回合前瞻' };
for (const id of species) {
  const stage = EVO1_POOL.includes(id) ? 2 : 1;
  for (const wounded of [false, true]) for (const encounter of fusionEncounters(stage)) {
    for (const policy of FUSION_POLICIES) for (let offset = 0; offset < seeds; offset++) for (const variant of FUSION_VARIANTS) {
      runs.push(simulateFusionTrial(id, variant, policy, wounded, encounter, seedStart + offset));
    }
  }
  console.log(`完成 ${getMonster(id).name}，累计 ${runs.length} 场`);
}
const mean = (items: FusionTrial[], key: keyof FusionTrial) => items.reduce((sum, item) => sum + Number(item[key]), 0) / items.length;
const winRate = (items: FusionTrial[]) => items.filter(item => item.result === 'won').length / items.length * 100;
const groups = species.flatMap(id => FUSION_POLICIES.flatMap(policy => [false, true].flatMap(wounded => FUSION_VARIANTS.map(variant => {
  const items = runs.filter(item => item.speciesId === id && item.policy === policy && item.wounded === wounded && item.variant === variant);
  return { speciesId: id, policy, wounded, variant, samples: items.length, winRate: winRate(items), timeouts: items.filter(item => item.result === 'timeout').length, rounds: mean(items, 'rounds'), deaths: mean(items, 'deaths'), damage3: mean(items, 'damage3'), taken3: mean(items, 'taken3'), healing3: mean(items, 'healing3'), shield3: mean(items, 'shield3'), statuses3: mean(items, 'statuses3'), hpStart: mean(items, 'hpStart'), hpEnd: mean(items, 'hpEnd'), actions: mean(items, 'actions') };
}))));
const budgets = species.map(fusionStatBudget);
const lines = [
  '# 主模式融合专项模拟报告', '',
  `每组合 ${seeds} 个固定种子（${seedStart}–${seedStart + seeds - 1}），共 ${runs.length} 场；普通难度、当前引擎，不修改宠物/敌人数值。`, '',
  '## 方法与限制', '',
  '- 对照：两只同形态+一只固定队友；融合无替补：新形态+该队友；另测输出替补与治疗替补补齐空位。',
  '- 坦克/反伤链的材料与主宠站前排、固定队友为输出；其他链站后排、固定队友为坦克。替补占材料原位置。',
  '- 一阶固定队友/替补采用一阶，二阶采用二阶。替补不是免费收益：有替补实验假定待命队伍中原本存在该伙伴，未比较不融合时改上替补的最优阵容。',
  '- 满血与受伤组分开；受伤组未融合单位均为向上取整的50%生命，新形态按现行规则回满，故包含一次性治疗收益。',
  '- 两阶段分别测试快攻、反伤、毒火、回复、进阶精英、首领小怪；这是固定压力样本，不是地图遭遇概率分布。三人均满足敌人数+1的出战上限，未模拟五人满编阵容。',
  '- 原贪心沿用现有模拟的技能选择方向（治疗阈值、按单段伤害排序），关闭捕获/物品。前瞻先下完整指令，再逐单位枚举该回合技能与目标，以真实引擎预演结果评分；可获知种子下敌方行为，不能等同真人或全局最优。',
  '- 前瞻评分=存活单位生命+0.35×护盾+25×存活数+0.6×状态估值的敌我差，胜负另加减1000；只前瞻一回合，可能低估长期增益。',
  '- 同一组合使用相同种子，但融合会改变随机调用序列，不保证逐次随机事件相同。未采用尚未实现的祝福或行动点改版。',
  '- 前3次回合结算累计有效HP伤害/治疗（不计过量伤害），包含引擎在结算后立即执行的下一回合开始效果；提前结束则按实际结算数。护盾为获得量，不等于吸收伤害；状态为遥测附加事件数，不等于层数或收益。',
  '- 全部战斗最多结算50次，超时单列，不作胜利。无长期捕获、材料稀缺、金币价值和跨战续航模型。', '',
  '## 静态属性预算', '', '| 进化 | 两只原形态总生命 | 新形态生命 | 生命保留率 | 单位速度变化 | 基础行动次数 |', '| --- | ---: | ---: | ---: | --- | --- |',
];
for (const item of budgets) lines.push(`| ${getMonster(item.speciesId).name}→${getMonster(item.nextId).name} | ${item.pairHp} | ${item.fusedHp} | ${(item.hpRatio * 100).toFixed(1)}% | ${item.oldSpd}→${item.newSpd} | 2→1 |`);
for (const policy of FUSION_POLICIES) for (const wounded of [false, true]) {
  lines.push('', `## ${policyLabels[policy]} · ${wounded ? '受伤' : '满血'}开战`, '', '| 进化 | 不融合胜率 | 无替补胜率（差值pp） | 输出替补胜率（差值pp） | 治疗替补胜率（差值pp） |', '| --- | ---: | ---: | ---: | ---: |');
  for (const id of species) {
    const cells = FUSION_VARIANTS.map(variant => groups.find(item => item.speciesId === id && item.policy === policy && item.wounded === wounded && item.variant === variant)!);
    const values = cells.map((cell, index) => `${cell.winRate.toFixed(1)}%${index ? `（${(cell.winRate - cells[0].winRate).toFixed(1)}）` : ''}`);
    lines.push(`| ${getMonster(id).name}→${getMonster(budgets.find(item => item.speciesId === id)!.nextId).name} | ${values.join(' | ')} |`);
  }
  lines.push('', '| 原形态 | 方案 | 前3结算伤害 | 受伤 | 治疗 | 获盾 | 状态事件 | 场均阵亡 | 场均行动 |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const item of groups.filter(item => item.policy === policy && item.wounded === wounded)) lines.push(`| ${getMonster(item.speciesId).name} | ${variantLabels[item.variant]} | ${[item.damage3, item.taken3, item.healing3, item.shield3, item.statuses3, item.deaths, item.actions].map(value => value.toFixed(2)).join(' | ')} |`);
}
lines.push('', '## 超时与复现', '', `超时 ${runs.filter(item => item.result === 'timeout').length} 场。运行：npm run balance:fusion -- ${seeds}。逐场明细与汇总见同目录 fusion-report.json。`);
const output = resolve('balance-output/fusion-assessment');
mkdirSync(output, { recursive: true });
const version = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const report = { generatedAt: new Date().toISOString(), codeVersion: version, note: '包含当前工作区未提交的专项评估代码，游戏引擎与数据表未修改', seedStart, seeds, budgets, groups, runs };
writeFileSync(resolve(output, 'fusion-report.json'), JSON.stringify(report), 'utf8');
writeFileSync(resolve(output, 'fusion-report.md'), lines.join('\n') + '\n', 'utf8');
console.log(`报告：${output}`);
if (runs.some(item => item.result === 'timeout')) process.exitCode = 1;
