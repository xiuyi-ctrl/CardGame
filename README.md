# 驯牌远征 (PetCard Rogue)

肉鸽卡牌宠物对战游戏，参考《驯牌师》(Decktamer) 玩法。选择御三家伙伴，穿越随机生成的 5~7 层地图，驯服敌人、升级进化，连闯 3 幕击败首领。

- **技术栈**：Electron + Vite + React + TypeScript
- **核心玩法**：五行克制（火→自然→水→影→钢→火）、回合制战斗、残血驯服、经验进化、随机抉择事件、可播种随机（全局可复现）
- **平台**：Windows 便携版 `.exe`

## 快速开始

```bash
# 安装依赖（国内需镜像）
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install

# 开发模式（Vite + Electron 双进程热更新）
npm run dev

# 测试 / 类型检查 / 构建
npm test
npm run typecheck
npm run build

# 打包 Windows 便携版（产物在 release/）
npm run dist
```

> 打包遇到 winCodeSign 符号链接权限错误时，先设置 `$env:CSC_IDENTITY_AUTO_DISCOVERY="false"`。

## 玩法

- 开局 2 只宠物（御三家之一 + 随机同伴），队伍上限 6、出战 3。
- 五行克制，克制 1.5x、被克 0.75x；战斗胜利后全队回血 50%。
- 敌人残血（≤40%）可喂食驯服；宠物阵亡永久删除。
- 每场战斗结束自动进化；进化链最多两段（如 毛毛→毛毛王后→毛毛神）。
- 地图含遭遇战 / 精英 / 商人 / 休整 / 奇遇 / 首领；奇遇为多选一抉择，风险与收益并存。
- 💎 奇遇关（稀有节点）：8 项高级奖励抽 3 选 1——直接进化、超进化（附负面诅咒）、属性强化、造物·自创生物、圣果、净化药水、跳关道具等。
- 详细玩法见 [`游戏玩法说明.md`](游戏玩法说明.md)，全部生物见 [`生物图鉴.md`](生物图鉴.md)。
