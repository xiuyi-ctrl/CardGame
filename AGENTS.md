# AGENTS.md

> 本文件面向未来的 OpenCode 会话，帮助快速上手本仓库。

## 项目

- 肉鸽卡牌宠物对战游戏「驯牌远征」（参考《驯牌师》Decktamer），技术栈：Electron + Vite + React + TypeScript。
- 目标产物：Windows 便携版 `.exe`。已产出 `release/驯牌远征-0.1.0.exe`（68 MB，可启动）。

## 开发命令

- `npm run dev`：同时启动 Vite(5173) 与 Electron（双进程热更新）。
- `npm test` / `npx vitest run`：单元测试（104 个，含整局模拟）。
- `npm run typecheck`：TS 类型检查（tsconfig.json + tsconfig.electron.json）。
- `npm run build`：编译 Electron 主进程 + 类型检查 + Vite 产物到 `dist/`。
- `npm run dist`：build 后 electron-builder 打包 `--win portable`。
- 打包遇到 winCodeSign symlink 权限错误时：`$env:CSC_IDENTITY_AUTO_DISCOVERY="false"` + 已配置 `win.signAndEditExecutable: false` 跳过签名（注意：会使用 Electron 默认图标，未自定义）。

## 包结构边界

- `src/game/`：纯逻辑、数据驱动、可播种随机（与 UI 完全解耦，可单测）。
  - `types.ts` 全量类型；`rng.ts` 可复现随机；`data/{skills,foods,monsters}.ts` 数据表。
  - `core/battle.ts` 战斗引擎（createBattle/playerSkill/playerTame/advance/useRng/currentPlayerUnit/isTameable）。
  - `state/game.ts` 地图/奖励/成长/融合；`state/reducer.ts` 全局状态机与所有 GameAction。
- `src/ui/`：React 界面（App.tsx 全界面 + BattleScreen.tsx + components.tsx + styles.css）。
  - 战斗布局：屏幕左侧居中竖向滚动日志面板（`.log-panel`，敌/我/系统分色）；底部操作面板 `.action-panel` 左侧为技能区（2 列网格、最多两行无滚动条，按钮=技能名+数值+描述），右侧为食物/战斗道具区。
  - 组件 `components.tsx`：`UnitCard`（`showSkills` 默认 true，出阵我方卡传 false 隐藏技能）、`SkillTag`/`skillBrief`（技能名+金色数值，供敌方卡/队伍界面/预览使用）。
- `electron/`：Electron 主进程/预加载（编译产物到 `dist-electron/`）。
- `tests/`：vitest 测试（`test.include` 已限定 `tests/**/*.test.ts`，避免误扫 `.agents/skills`）。

## 核心设计约定

- 属性只有 `maxHp/hp/spd`（整数）；无等级/经验/攻击/防御/五行元素。伤害=技能固定值（`SkillDef.damage?/heal?`）+ 固定修正（战吼+2/虚弱-1/铁刺-1/药水±1，见 `getDamageBonus`）+ 每段 ±1 浮动 + 暴击 1.5x（~10%）。`getEffectiveSpd` 含药水 ±1。
- 成长=「融合」：进化链第 n 阶需 n+1 只同物种（`fusionNeedCount`，1 阶 2 只、2 阶 3 只…）；队伍界面主宠+材料融合，继承主宠 bonusStats/诅咒/自创技能，血回满。`nextStage(speciesId)` 取下一形态。属性强化固定值：生命+3 / 速度+1。
- 战斗日志为结构化 `LogEntry[]`（`{ text, side: 'player'|'enemy'|'info' }`）：`pushLog(b, msg, side)` 带阵营，技能/状态/道具按行动者或受击者阵营，系统消息用 info。UI 左侧日志面板按 side 分色。
- 状态：灼烧 2伤/2R、中毒 2伤/3R、战吼 伤害+2/2R、铁刺 伤害-1/2R、眩晕（跳过行动）。侵蚀节点：速度-1（入场）或 我方受伤+1。
- 属性强化固定值：生命 +3 / 速度 +1；诅咒：血脆=生命-5、虚弱=伤害-1、迟缓=速度-1；侵蚀节点：速度-1 / 受伤+1。
- 敌人残血（≤40%）可喂食驯服加入队伍；宠物战斗阵亡永久删除；战后全体回血 50%。
- 开局 2 只宠物（御三家之一 + 随机同伴），队伍上限 8、出战 3；队伍已满时驯服的新宠物进「处理队伍」界面（替换/融合/放生）。
- 侦查符/跳关道具均为背包中使用：背包点击 → 返回地图进入选择模式 → 点击目标节点执行。侦查符可看任意一关情报；跳关道具仅对可达的战斗类节点（battle/elite/arena/gauntlet/corrupted）直接获得奖励，boss/guardian 不可跳。双生宝箱双开仅由双生符触发。
- 背包界面：HUD 右侧「🎒 背包」可随时打开（查看宠物/道具，使用侦查符/跳关道具/净化药水）。
- 所有随机必须经 `useRng`/`createRng`（seed + rngCount），保证确定性、可复现、可单测。
- 平衡靠 `tests/simulation.test.ts` 的自动玩家整局模拟回归（当前 20 种子中至少 1 局通关、0 卡死）。

## 会话约定

- **一律用中文描述**（回复、总结、说明均用中文，代码注释/标识符保持英文）。
- **提交 GitHub 时 commit message 一律用中文**（英文 message 不适用）。
- **浏览器/UI 实测需用户明确要求后才做**：默认只写代码 + 跑 `vitest`/`typecheck`/`build` 验证；用户没让测 UI，就不启动 agent-browser。
- 没要求提交github就不用提交

## 重要环境注意

- **绝不用 PowerShell `Set-Content`/`Get-Content` 读写含中文的文件**（会把 UTF-8 编码写坏），编辑一律用 write/edit 工具。
- 中文输出经 PowerShell 管道会乱码，调试日志建议写入临时文件（如 `C:\Users\DELL\AppData\Local\Temp\opencode\`）再读取，或输出 ASCII 标记。
- 国内安装依赖需 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。
