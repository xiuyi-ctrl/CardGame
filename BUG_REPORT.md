# 驯牌远征 Bug 分析报告

> 生成时间：2026-09-11
> 代码版本：最新 main

---

## 严重级别定义

| 级别 | 说明 |
|------|------|
| **高** | 影响核心玩法、显示错误、数据不一致 |
| **中** | 边缘情况触发、确定性破坏、属性丢失 |
| **低** | 代码质量问题、防御性编程缺失 |

---

## 高优先级

### BUG-01：动画速度显示与实际计算不一致

- **文件**: `src/ui/battleFx.ts:181-182`
- **现象**: `spdOfUnits` 中 battleBuffs 的 spdUp/spdDown 使用 `±1`，但 `getEffectiveSpd`（battle.ts:2723-2725）使用 `±2`
- **影响**: 动画中显示的速度值与实际回合排序使用的速度值不同，导致玩家看到的出手顺序与实际不一致
- **修复**: `battleFx.ts:181` 改为 `(u.battleBuffs?.spdUp ? 2 : 0) - (u.battleBuffs?.spdDown ? 2 : 0)`

### BUG-02：事件系统 sacrifice/boost 直接修改属性，融合后丢失

- **文件**: `src/game/state/reducer.ts:717-741`
- **现象**: `sacrifice` 和 `boost` 事件直接修改 `maxHp`/`spd`，未通过 `bonusStats` + `recomputeStats`
- **影响**: 通过事件获得的永久属性加成在融合时丢失（融合继承 bonusStats，不继承直接修改的基础值）
- **修复**: 改用 `recomputeStats({ ...u, bonusStats: { ...u.bonusStats, [stat]: (u.bonusStats?.[stat] ?? 0) + amount } })`

---

## 中优先级

### BUG-03：多处使用内联取模代替 useRng，破坏确定性

- **文件及行号**:
  - `battle.ts:1380-1383` — `applyCorruptSpread`（腐化蔓延）
  - `battle.ts:1599-1600` — `thornEntangle`（缠绕荆棘）
  - `battle.ts:1614` — `flameAura`（烈焰环绕）
  - `battle.ts:1714-1715` — `corruptSac`（腐化囊体）
  - `battle.ts:1534` — `weaken`（弱化随机选择）
  - `battle.ts:1989` — `spore_summon`（孢子召唤）
- **现象**: 使用 `Math.abs((nb.rngCount ?? 0)) % N` 配合手动 `rngCount++` 代替 `useRng`
- **影响**: 破坏种子确定性——存档读档/重放时 RNG 序列不一致，导致不同结果
- **修复**: 统一改用 `useRng(nb, (v, nb2) => { ... return nb2; })`

### BUG-04：chainLink 重新连接时不更新 sourceUid

- **文件**: `src/game/core/battle.ts:838-844`
- **现象**: `applyStatusTo` 的 default 分支仅对 `taunt` 更新 `sourceUid`，`chainLink` 重连时保留旧的 sourceUid
- **影响**: 锁链重定向功能在重新连接后失效
- **修复**: 条件改为 `effect.kind === 'taunt' || effect.kind === 'chainLink'`

### BUG-05：shadowHunter 额外行动循环无迭代上限

- **文件**: `src/game/core/battle.ts:2329-2333`
- **现象**: `shadowHunter` 击杀目标后触发额外行动，`continue` 重新处理同一单位，理论上可多次循环
- **影响**: 极端情况下可能导致长时间卡顿（实际被场上单位数限制，但缺乏防御性上限）
- **修复**: 添加计数器，限制连续额外行动不超过 5 次

---

## 低优先级

### BUG-06：isValidGameState 缺少 achievements/difficulty-select 屏幕

- **文件**: `src/game/state/reducer.ts:122`
- **现象**: `screens` 校验数组未包含 `'achievements'` 和 `'difficulty-select'`
- **影响**: 在这些界面触发存档时 `isValidGameState` 返回 false，存档失败
- **修复**: 补充这两个屏幕类型到校验数组

### BUG-07：generateRewards 种子未包含 currentNodeId

- **文件**: `src/game/state/game.ts:1798`
- **现象**: 奖励种子仅用 `seed + act*7 + row*31`，同一行的连续战斗产生相同奖励选项
- **影响**: 同行连续战斗可看到重复奖励
- **修复**: 种子加入 `currentNodeId` 哈希

### BUG-08：HpBar 在 maxHp=0 时除零

- **文件**: `src/ui/components.tsx:166`
- **现象**: `(hp / maxHp) * 100` 在 maxHp=0 时产生 NaN
- **影响**: 正常游戏不会触发（所有单位 maxHp≥1），但损坏的存档数据可能触发
- **修复**: `maxHp > 0 ? (hp / maxHp) * 100 : 0`

### BUG-09：BattleBuffIcons 中 skillSpd 死代码

- **文件**: `src/ui/components.tsx:262-269`
- **现象**: `skillSpd` 在 line 262 已被过滤，但 line 267 仍有 `k === 'skillSpd'` 判断（不可达）
- **影响**: 无功能影响，仅代码冗余
- **修复**: 删除死代码分支

---

## 已修复（本次会话）

| 问题 | 修复内容 |
|------|----------|
| 状态技能系统 | `kind:'status'` 独立分支，不触发攻击被动 |
| 飘字显示 | debuff 飘字显示具体状态名（中毒↓/弱化↓等） |
| burstTargets 误判 | 状态技能日志不再被误判为 burst 事件 |
| 弱化日志匹配 | effectDesc 反映实际施加的 debuff |
| debuff 图标时序 | revealUids + computeRevealAt 支持多目标 debuff |
| 怒棘层数显示 | pushLog 补充 addsStatus + newStatuses 检测 value 增加 |

---

## 建议优先修复顺序

1. **BUG-01**（速度显示不一致）— 影响核心战斗体验，修复简单
2. **BUG-02**（事件属性丢失）— 影响玩家养成体验，修复简单
3. **BUG-03**（RNG 确定性）— 影响存档/重放一致性，需逐个替换
4. **BUG-04**（chainLink）— 锁链机制 bug，修复简单
5. 其余低优先级项按需处理
