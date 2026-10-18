# 地图节点图标 PNG · 第二批

`icons/` 内为 16 张独立透明 PNG，均为 128 × 128；已接入地图节点及共用的节点图标组件，运行时副本位于 `public/map-node-icons/`，合集副本位于 `美术素材/map-node-icons/`。`index.html` 按地图约 45 px 和信息区约 62 px 的使用尺寸预览。

| 类型 | 图标 | 识别点 |
| --- | --- | --- |
| battle | 交叉双剑 | 普通战斗 |
| elite | 红角骷髅 | 精英 |
| boss | 红金王冠 | 首领 |
| guardian | 青绿纹章盾 | 守卫 |
| rest | 篝火 | 休整 |
| shop | 金币钱袋 | 商店 |
| event | 青蓝问号符文 | 事件 |
| special | 单只宝箱 | 奇遇 |
| arena | 石质竞技场 | 竞技场 |
| gauntlet | 钢铁拳套 | 车轮战 |
| corrupted | 紫黑裂纹晶体 | 侵蚀 |
| watchtower | 瞭望塔 | 侦查 |
| sync | 锁链双宝箱 | 双生宝箱 |
| keydoor | 上锁石门 | 钥匙门 |
| blacksmith | 铁砧与锤 | 铁匠铺 |
| arena3 | 三色竞技旗 | 三模式竞技场 |

使用内置 imagegen 制作四组 2 × 2 像素美术原稿，再按 `generate2dsprite` 流程去除纯品红底、居中切图。统一提示词规则：深海军蓝阶梯像素描边、有限明亮色板、顶部浅色高光、单个居中物体、无底座或文字；每组按上表的四种主体分别指定造型。`combat/`、`explore/`、`challenge/`、`special/` 保留原稿、透明图集和处理元数据。

切图检查：16 张均非空，导出边缘无裁切，透明角点 alpha 为 0。`challenge` 组原稿有接近分格边缘的像素，经目视确认主体完整后启用 source-edge 容差；成品无边缘接触或粘贴裁切。
