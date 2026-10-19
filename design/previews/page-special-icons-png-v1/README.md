# 其余页面专用图标 PNG · 第五批

`icons/` 中有 11 张独立透明 PNG，均为 128 × 128，已接入对应页面。运行时副本位于 `public/page-special-icons/`，交接副本位于 `美术素材/page-special-icons/`。`index.html` 提供不同显示尺寸的预览。

| 文件 | 预定位置 | 识别元素 |
| --- | --- | --- |
| `victory-swords.png` | 战斗胜利标题 | 银色交叉双剑、金色桂枝 |
| `shop-refresh.png` | 商店刷新 | 环形金箭头、金币 |
| `arena-simulation.png` | 竞技场模拟战 | 蓝色镜晶、对称爪印 |
| `arena-challenge.png` | 竞技场挑战赛 | 红色剑刃、角斗场、战旗 |
| `arena-exhibition.png` | 竞技场表演赛 | 紫色舞台、聚光灯、奖杯 |
| `watchtower-telescope.png` | 瞭望塔 | 铜质望远镜、三脚架 |
| `chest-open.png` | 宝箱结果 | 打开的木箱、蓝色宝石 |
| `upgrade-anvil.png` | 强化入口 | 铁砧、锤击火花 |
| `creation-custom_guardian.png` | 造物·守护模板 | 宽厚岩甲剪影 |
| `creation-custom_fury.png` | 造物·狂怒模板 | 利爪与火尾剪影 |
| `creation-custom_gale.png` | 造物·疾风模板 | 展翼与风尾剪影 |

使用内置 imagegen 生成两张 2 × 2 图标原稿与三张造物模板原稿，统一沿用深海军蓝像素描边、青蓝与橙金重点色。再用 `generate2dsprite` 切图、品红去底并导出。原稿、透明图集与质量检查元数据保留于各分组目录；11 张结果均无空帧、源图边缘碰撞、输出边缘碰撞或粘贴截断。

页面切换预加载已覆盖全部 11 张图标；竞技场使用三张独立模式图，造物模板继续保留问号覆盖层。原有奖励、刷新、模式选择、强化及造物操作保持原逻辑。
