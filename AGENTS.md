# AGENTS.md

> 本文件面向未来的 OpenCode 会话，帮助快速上手本仓库。

## 项目

- 肉鸽卡牌宠物对战游戏「驯牌远征」（参考《驯牌师》Decktamer），技术栈：Electron + Vite + React + TypeScript。
- 目标产物：Windows 便携版 `.exe`。已发布 `v0.1.1`（含生物图鉴，Releases 页可下载）。

## 开发命令

- `npm run dev`：同时启动 Vite(5173) 与 Electron（双进程热更新）。
- `npm test` / `npx vitest run`：单元测试（120 个，含整局模拟）。
- `npm run typecheck`：TS 类型检查（tsconfig.json + tsconfig.electron.json）。
- `npm run build`：编译 Electron 主进程 + 类型检查 + Vite 产物到 `dist/`。
- `npm run dist`：build 后 electron-builder 打包 `--win portable`。
- 打包遇到 winCodeSign symlink 权限错误时：`$env:CSC_IDENTITY_AUTO_DISCOVERY="false"` + 已配置 `win.signAndEditExecutable: false` 跳过签名（注意：会使用 Electron 默认图标，未自定义）。

## 发布流程（CI 自动）

- 发布由 GitHub Actions 自动完成（`.github/workflows/release.yml`）：**push `v*` 标签**即触发，在 `windows-latest` 上 `npm ci` → 从 tag 写入版本号 → build + electron-builder portable → 用 gh 创建 Release 并上传 `release/*.exe`。
- 发版三步：
  1. 改代码并 push（`git push origin main`）；
  2. `git tag vX.Y.Z`（tag 需与 `package.json` version 一致，如 `v0.2.0` → `0.2.0`，CI 会自动从 tag 覆盖 version）；
  3. `git push origin vX.Y.Z`，等待 Actions 完成（约 5~10 分钟），产物出现在 Releases 页。
- 产物名 `驯牌远征-<version>.exe`（electron-builder `artifactName`）；CI 环境无 PowerShell 编码/文件占用问题，无需本地打包。
- 手动备选：本地 `$env:CSC_IDENTITY_AUTO_DISCOVERY="false"; npm run dist` 后，用 `gh release create vX.Y.Z "release/驯牌远征-<version>.exe" --generate-notes` 发布（中文文件名经 PowerShell 传参可能丢失，需用 ASCII 名或 curl 上传，见提交历史）。

## 包结构边界

- `src/game/`：纯逻辑、数据驱动、可播种随机（与 UI 完全解耦，可单测）。
  - `types.ts` 全量类型；`rng.ts` 可复现随机；`data/{skills,foods,monsters}.ts` 数据表。
  - `core/battle.ts` 战斗引擎（createBattle/playerSkill/playerTame/playerEndTurn/useRng/currentPlayerUnit/isTameable）。
  - `state/game.ts` 地图/奖励/成长/融合；`state/reducer.ts` 全局状态机与所有 GameAction。
- `src/ui/`：React 界面（App.tsx 全界面 + BattleScreen.tsx + components.tsx + styles.css）。
  - 战斗布局：屏幕左侧居中竖向滚动日志面板（`.log-panel`，敌/我/系统分色）；底部操作面板 `.action-panel` 从左到右依次为捕获区（`.capture-panel`）、道具区（`.items-panel`，食物/战斗药水）、技能区（`.skill-column`，3 列网格、行 22px+58px+58px、宽 540px 居左、最多两行无滚动条，按钮=技能名+数值+描述）、回合区（`.end-panel`，⚡ 行动点 + 结束回合）。
  - 组件 `components.tsx`：`UnitCard`（`showSkills` 默认 true，出阵我方卡传 false 隐藏技能）、`SkillTag`/`skillBrief`（技能名+金色数值，供敌方卡/队伍界面/预览使用）、`SkillTag` 的 `usesNote` 在 desc 模式显示「每场限 N 次」。
  - 登录界面 `HomeScreen` 主菜单含「📖 生物图鉴」按钮，打开 `CodexScreen` 覆盖层：左侧按 普通/精英/传奇/首领/造物 分组，右侧展示详情（属性/被动/技能/驯服/融合/说明），数据来自 `MONSTERS`+`computeStats`+`getPassive`+`nextStage`（物种 `desc` 为图鉴说明，见 `monsters.ts`）。
- `electron/`：Electron 主进程/预加载（编译产物到 `dist-electron/`）。
- `tests/`：vitest 测试（`test.include` 已限定 `tests/**/*.test.ts`，避免误扫 `.agents/skills`）。

## 核心设计约定

- 属性只有 `maxHp/hp/spd`（整数）；无等级/经验/攻击/防御/五行元素。伤害=技能固定值（`SkillDef.damage?/heal?`）+ 固定修正（战吼+2/虚弱-1/铁刺-1/药水±1，见 `getDamageBonus`），无随机浮动；**受击减伤被动（guard）对多段技能的每一段都生效**（每段最低 1）。`getEffectiveSpd` 含药水 ±1。**速度加成技能**：`SkillDef.spdScaling?: number`，伤害 += 施法者当前速度 × spdScaling（狂叶/叶震波等）。
- 成长=「融合」：进化链第 n 阶需 n+1 只同物种（`fusionNeedCount`，1 阶 2 只、2 阶 3 只…）；队伍界面主宠+材料融合，继承主宠 bonusStats/诅咒/自创技能，血回满。`nextStage(speciesId)` 取下一形态。属性强化固定值：生命+3 / 速度+1。
- **反伤先打盾**：`applyCounterDmg(attacker, dmg)` 统一处理荆棘/盾反/棘刺王的反击伤害——先扣护盾再扣血，避免护盾失效后反伤仍穿透护盾的 bug。`thorns`/`thornRoyal`/`shieldCounter` 三处均已改为调用此函数。
- **技能冷却**：`SkillDef.cooldown?: number` 设置使用后冷却回合数（缺省=0）；`Unit.skillCooldowns?: Record<string, number>` 追踪当前冷却；`applySkillCooldown` 存储 `skill.cooldown + 1`（因为 `startRound` 在回合开始时立即递减，+1 确保实际冷却回合数正确）；`skillCooldownLeft` 检查冷却是否归零。已设：盾反（shield_counter）冷却 1 回合。
- **换位限次**：`Unit.swapCount?: number` 追踪每场战斗换位次数，上限 2 次（守卫战禁用换位）。
- **幕次+节点类型**：`BattleState.act?: number`（当前幕次 1/2/3）+ `BattleState.nodeType?: string`（battle/elite/arena/gauntlet/guardian/corrupted），从 `BattleOptions` 传入，AI 根据这些字段调整概率阈值和评分权重。
- **复仇棘甲先手**：`revenge_thorn` 技能设 `priority: 'first'`，确保在所有非先手技能之前施放。
- **Boss小怪系统**：`BOSS_MINIONS` 映射表定义每个 Boss 的小怪 speciesId 列表；`buildEncounter` 自动追加小怪；小怪 rank=4，不可驯服，击败无奖励，死亡时显示「XX 被击倒了」日志。
- **敌方按角色布局**：`planEnemyLayout` 按被动/治疗技能/等级分类——防守被动（guard/thorns/regen/hp/damageCap/thornRoyal/bigHitGuard/spdOnHit/treeSpeedUp/lifeSpring）或 Boss（rank 4）→ 前排；进攻被动（power/frenzy/venom/scorch/drain/venomPower/speedBonus/scorchPlus/poisonBreak/spdOnAttack/tideRhythm/tideEcho/thornEntangle）或治疗技能（heal>0）→ 后排；前排满 3 列溢出后排；全后排时 baseHp 最高者挪前排（保底 ≥1 前排）。Boss 在首领战中强制前排居中，与小怪互换位置。
- **受击加速**：`hit_speed_up` 被动，每次受到攻击后速度 +1，可叠加最多 6 层（古树之主专属）。
- **古木加速**：`tree_speed_up` 被动，每回合结束时回复3点生命值，每次受到攻击后速度 +1，可叠加最多 6 层（古树之主专属）。
- 战斗日志为结构化 `LogEntry[]`（`{ text, side, hp, actorUid?, targetUid?, addsStatus? }`）：`pushLog(b, msg, side, actorUid?, targetUid?, addsStatus?)` 带阵营，技能/状态/道具按行动者或受击者阵营，系统消息用 info；`hp` 为该条日志时全体血量快照，`addsStatus` 标记本次攻击附加的状态 kind（灼烧/中毒/减防/眩晕，仅标在攻击日志最后一段，无附加则为 undefined）。UI 日志面板按 side 分色，**只显示已揭示的条目**（`useBattleFx` 的 `revealedLogLen`：动画事件 i 播放时揭示到对应日志，动画结束补全），最多最近 6 条。
- 战斗动画（`src/ui/battleFx.ts`）按日志事件排队播放；新增状态标签在**附加它的那次行动动画**播放时才揭示（攻击类状态按 `addsStatus` 精确归属，同一目标多只宠物附加不同状态时按攻击顺序依次显示；连击多段标在最后一段、在最后一段动画揭示；**连击若一段即清掉目标（敌方全灭）则后续段不再命中、不产生攻击日志，对应动画不播放**；**buff 状态（如战吼 atkUp）归入该单位施放 buff 技能的施法动画**，即便该单位本回合先受 dot 掉血也不提前），到期状态在其最后一次掉血动画时移除。胜负结算弹窗在动画全部播放完后再显示——我方全灭时先播完死亡动画才弹失败界面（`BattleScreen` 的 `won`/`lost` 弹窗均带 `!animating` 条件）。
- 状态：灼烧/中毒**可叠加层数**（重复附加层数相加），每回合结算 ceil(层数/2) 层（向上进位）并扣等量伤害、归 0 消失；战吼 伤害+2/2R、铁刺 伤害-1/2R、眩晕（跳过行动）。**战吼施放回合不计**：战吼（atkUp）`turns: N` 施放回合生效后还持续 N 个完整回合（实际跨越 N+1 回合）；铁刺/嘲讽/眩晕等负面状态施放回合正常计入。侵蚀节点：速度-2（入场）或 我方受伤+2（**多段每段都 +2**）或 每回合结束受到 2 点伤害。
- **技能次数**：`SkillDef.uses?` 设置每场战斗的可用次数（缺省=无限，`skillUsesLeft` 返回 Infinity）。有限次技能在玩家/敌方使用后各扣 1（`consumeSkillUse` 需按当前状态重新取单位，勿用旧引用否则覆盖治疗等改动）；耗尽后 `playerSkill` 拒绝、UI 按钮禁用显示「剩 N 次/已用完」。已设：愈光（heal_light）2 次、战吼（roar）2 次。
- **专属被动**：`MonsterSpecies.passive` + `Unit.passive`，所有生物（含 Boss/造物）各有 1 个，表在 `data/passives.ts`（`PASSIVES`/`getPassive`）。类型 `PassiveKind`：`hp`（最大生命+）`spd`（入场速度+）`regen`（回合开始回血）`thorns`（受击反伤）`drain`（造成伤害吸血）`power`（技能伤害+）`guard`（受击减伤，`getDamageGuard`）`venom`/`scorch`（攻击命中附中毒/灼烧）`frenzy`（血量<50% 伤害+）`venomPower`（对中毒目标伤害+）`damageCap`（每回合伤害上限）`poisonBreak`（攻击中毒目标无视护盾+真伤）`speedBonus`（速度差转伤害）`spdOnAttack`（攻击后速度+）`bigHitGuard`（大额伤害减免）`scorchPlus`（灼烧层数转伤害加成）。**guard 减伤、侵蚀「伤害加深」、thorns 反伤、drain 吸血对多段攻击均按段生效**（每段最低 1）。被动入口：`makeUnit` 应用 hp/spd 加成、`startRound` 处理 regen、攻击结算处理 guard/venom/scorch/thorns/drain、`getDamageBonus` 含 power/frenzy/venomPower/speedBonus/scorchPlus。UI 卡片显示 `PassiveBadge`（components.tsx）。
- **超进化诅咒 UI**：`Unit.curse`（`hpDown`/`atkDown`/`spdDown`）在战斗卡片上通过 `CurseBadge` 显示（红色标签，图标+中文名），与 `PassiveBadge`/`BattleBuffIcons` 并列。
- 属性强化固定值：生命 +3 / 速度 +1；诅咒：血脆=生命-5、虚弱=伤害-1、迟缓=速度-1；侵蚀节点：速度-2 / 受伤+2 / 每回合-2HP。
- 敌人残血（≤40%）可喂食驯服加入队伍；宠物战斗阵亡永久删除；战后全体回血 60%。敌方治疗按各技能自身 `uses` 次数限制（用尽后不再选择该技能）。
- 开局 2 只宠物（御三家之一 + 随机同伴），队伍上限 8、出战 5；队伍已满时驯服/孵化/招募的新宠物进「处理队伍」界面（替换/融合/放生，队伍有空位时可直接加入；融合时待处理宠物也可作为同物种材料）。
- 地图生成：每幕层数按幕递进（幕1 8~10、幕2 10~12、幕3 12~14），出发后第 1 行强制全战斗；事件/商人数量随层数缩放（事件≈0.42×层数，上限6；商人≈0.28×层数，上限5，**最后两层必有 1 个商人**）；奇遇 ≤1；全战斗行 ≤2。
- 普通战斗敌人规模：`weightedPickEncounterSize` 按幕数权重抽取，4v4 **仅幕3 启用**（`ACT3_BASE_W = [10,40,45,5]`，后期修正 +15→约 17%）；幕1/2 无 4v4（表中第 4 项权重=0）。
- 侦查符/跳关道具均为背包中使用：背包点击 → 返回地图进入选择模式 → 点击目标节点执行。侦查符可看任意一关情报（含钥匙门/双生宝箱的确定奖励内容）；跳关道具仅对可达的战斗类节点（battle/elite/arena/gauntlet/corrupted）直接获得奖励，boss/guardian 不可跳。双生宝箱双开仅由双生符触发。
- 背包界面：HUD 右侧「🎒 背包」可随时打开（查看宠物/道具，使用侦查符/跳关道具/净化药水）。
- 所有随机必须经 `useRng`/`createRng`（seed + rngCount），保证确定性、可复现、可单测。
- 平衡靠 `tests/simulation.test.ts` 的自动玩家整局模拟回归（当前 20 种子中至少 1 局通关、0 卡死）。

## 会话约定

- **一律用中文描述**（回复、总结、说明均用中文，代码注释/标识符保持英文）。
- **每次修改代码后，必须同步更新相应的文档**：战斗逻辑/数值 → `战斗文档.md`、`游戏玩法说明.md`；地图/节点 → `关卡图鉴.md`；生物/道具数据 → `生物图鉴.md`、`道具图鉴.md`；README 若描述受影响也一并更新。文档改动与代码同一次提交。
- **提交 GitHub 时 commit message 一律用中文**（英文 message 不适用）。
- **浏览器/UI 实测需用户明确要求后才做**：默认只写代码 + 跑 `vitest`/`typecheck`/`build` 验证；用户没让测 UI，就不启动 agent-browser。
- 没要求提交github就不用提交

## 重要环境注意

- **绝不用 PowerShell `Set-Content`/`Get-Content` 读写含中文的文件**（会把 UTF-8 编码写坏），编辑一律用 write/edit 工具。
- 中文输出经 PowerShell 管道会乱码，调试日志建议写入临时文件（如 `C:\Users\DELL\AppData\Local\Temp\opencode\`）再读取，或输出 ASCII 标记。
- 国内安装依赖需 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。
