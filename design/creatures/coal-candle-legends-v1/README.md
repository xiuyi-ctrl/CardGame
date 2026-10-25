# 熔炉兽、长明灵蛾传奇形态美术 v1

2026-10-25。对应现有进化链：煤煤→炉甲獾→熔炉兽；烛烛→灯翅蛾→长明灵蛾。参考一次进化v2，遵循进化结构及剪影明显变化、像素密度统一的要求。

| 生物 | 与上一阶的主要差异 | 成品 | 提示词 |
| --- | --- | --- | --- |
| 熔炉兽 furnace_beast | 从挺立护卫改为巨臂撑地、低重心炉心巨兽；小头嵌入弯月肩甲，胸部露出大块炉心，保留奶白面纹及煤甲 | [透明原稿](../furnace-beast-pixel-v1/sprite-original.png)、[64像素](../furnace-beast-pixel-v1/sprite-64.png) | [完整提示词](../furnace-beast-pixel-v1/prompt-used.txt) |
| 长明灵蛾 eternal_moth | 从四片尖翼改为三对共六翼，上翼环拱、中翼展开、下翼围护；长分节腹改为圆灯囊，双尾下垂 | [透明原稿](../eternal-moth-pixel-v1/sprite-original.png)、[64像素](../eternal-moth-pixel-v1/sprite-64.png) | [完整提示词](../eternal-moth-pixel-v1/prompt-used.txt) |

`preview-original.png`为清晰原稿合览，左熔炉兽、右长明灵蛾；`preview-64.png`为64像素成品的最近邻合览。每只目录保留raw.png、prompt-used.txt、透明原稿、64像素成品、512预览、pixel-qc.json及export/pipeline-meta.json。

使用内置image_gen生成、generate2dsprite清理背景与严格QC。两只64像素成品均为64×64 RGBA、24种不透明颜色、透明度0／255、最长边56像素、底部y=59、至少4像素安全边。处理器严格QC通过；已查看原稿和64像素合览，主体完整，无可见品红残留。

2026-10-25长明灵蛾已按用户要求接入：`public/eternal_moth.png`及同名美术素材副本均使用 `eternal-moth-pixel-v1/sprite-original.png`。图鉴、队伍、进化预览、战斗与布阵共用新图；战斗和布阵直接显示透明原稿，旧存档缺失图片时补齐路径。熔炉兽v1已由后续v2替代。未修改数值、技能和进化路线，未重新打包APK、提交或发布。

接入验证：21项相关测试、类型检查和构建通过。六种横屏手机尺寸18例、三种桌面尺寸9例实际渲染通过，已抽查布阵及图鉴截图；public、dist、美术素材副本内容一致。截图与报告见 `dump/eternal-moth-art-mobile/`、`dump/eternal-moth-art-desktop/`，本次未做真机验收。
