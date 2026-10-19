# 开局与成长入口 PNG · 第四批

`icons/` 内为 10 张 128 × 128 的独立透明 PNG，已接入难度页、成就页、选宠标题及商店标题。运行时副本位于 `public/starter-growth-icons/`，合集副本位于 `美术素材/starter-growth-icons/`；`index.html` 按预期使用尺寸展示。

| 文件 | 对应位置 | 设计识别点 |
| --- | --- | --- |
| difficulty-header.png | 选择难度与遗物标题 | 金章远征地图 |
| difficulty-normal.png | 普通难度汇总 | 青绿林地与蜿蜒路径 |
| difficulty-hard.png | 困难难度汇总 | 蓝灰险峰与橙旗 |
| difficulty-nightmare.png | 地狱难度汇总 | 熔岩裂峰 |
| traveler_charm.png | 旅者护符 | 指南针吊坠 |
| elite_badge.png | 精锐之证 | 交叉金刃与蓝盾 |
| beast_master.png | 驯兽大师 | 爪印铜章 |
| starter-paw.png | 选择初始伙伴标题 | 青蓝爪印、橙色肉垫 |
| difficulty-shop.png | 商店倍率 | 橙金商棚 |
| difficulty-recovery.png | 战后恢复比例 | 绿色十字药瓶 |

使用内置 imagegen 制作四组像素美术原稿：两组 2 × 2 图集分别对应难度与遗物/爪印，商棚和药瓶为单图。提示词统一要求深海军蓝阶梯像素描边、鲜明的青绿与橙金、单个居中物件、无文字和纯品红底。使用 `generate2dsprite` 去底、居中切图并导出透明 PNG。原稿、透明图集和处理元数据保留在各分组目录。
