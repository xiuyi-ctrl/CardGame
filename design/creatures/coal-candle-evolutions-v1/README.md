# 煤煤与烛烛的一次进化美术

2026-10-25。对应现有物种煤煤→炉甲獾、烛烛→灯翅蛾；本批仅设计立绘，不改技能、属性、进化路线或运行时资源。

| 生物 | 设计要点 | 透明原稿 | 完整提示词 |
| --- | --- | --- | --- |
| 炉甲獾（coal_guard） | 保留奶白面纹、琥珀眼和煤背；抬高肩胸，增加肩臂炉甲、厚爪和橙色炉缝，呈护卫站姿 | [原稿](../coal-guard-pixel-v1/sprite-original.png) | [提示词](../coal-guard-pixel-v1/prompt-used.txt) |
| 灯翅蛾（lantern_moth） | 保留奶油绒毛、琥珀配色；展宽四瓣翅，增加灯纹、羽状触角和有骨架分区的灯笼腹部 | [原稿](../lantern-moth-pixel-v1/sprite-original.png) | [提示词](../lantern-moth-pixel-v1/prompt-used.txt) |

生成使用内置 image_gen，分别引用已接入的煤煤、烛烛透明立绘；使用 generate2dsprite 清理品红背景、导出透明原稿并做完整性检查。两只保持同套像素密度、阶梯描边及色块语言，没有改为细密插画。

- `preview-original.png`：透明原稿的奶油色背景合览，左炉甲獾、右灯翅蛾。
- `preview-64.png`：64像素成品的最近邻合览。
- 各自目录保留 `raw.png`、`prompt-used.txt`、`sprite-original.png`、`sprite-64.png`、`preview-512.png`、`pixel-qc.json` 及 `export/pipeline-meta.json`。

64像素成品统一为64×64 RGBA，主体包围盒为[4,14,60,60]、底部y=59、透明度0／255；炉甲獾24色，灯翅蛾23色。处理器严格QC通过；已查看透明处理后的合览与64像素预览，主体完整，无裁切或可见品红残留。

当前未覆盖 `public/` 或 `美术素材/`，未接入游戏、打包APK、提交或发布。
