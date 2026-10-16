# 战斗状态图标 v1

32 枚独立的 128×128 透明 PNG，供后续在战斗生物右侧展示状态时接入。

- 24 种 `StatusEffect.kind`：全部覆盖，包括技能封印与待生效封印。
- 5 种 `Unit.battleBuffs`：药水攻速增减及技能永久速度加成。
- 3 种 `Unit.curse`：血脆、虚弱、迟缓。

`icons/` 为独立图标；`manifest.json` 对应游戏键名、中文名和素材路径；`preview.png` 同时展示放大图与 24px 示例；`buff-icons-v1.zip` 包含独立 PNG、清单和总览图。

图标本体不含数字或文字，层数、数值与回合由界面叠加。常驻被动不属于本轮状态图标范围；被动产生的速度和攻击加成可以复用相应属性图标。原始生成图、精确提示词及透明化检查记录保存在 `packs/`。

已接入战斗界面：敌我生物右侧纵向显示最多 3 枚图标。运行时副本在 `public/buff-icons/`，集中素材副本在 `美术素材/buff-icons/`；界面映射和显示逻辑在 `src/ui/BattleStatusIcons.tsx`。
