# 灯翅蛾、炉甲獾、熔炉兽修订美术

2026-10-25。按用户反馈重新设计三只；长明灵蛾沿用已有传奇候选，本次未修改。

| 生物 | 本轮修订 | 透明原稿与完整提示词 |
| --- | --- | --- |
| 灯翅蛾 v3 | 四翼改为窄幅上收，短灯腹，无长飘尾；保留中间形态，和最终六翼环拢的长明灵蛾区分 | [原稿](../lantern-moth-pixel-v3/sprite-original.png)、[提示词](../lantern-moth-pixel-v3/prompt-used.txt) |
| 炉甲獾 v3 | 较大圆头、短肢、轻肩甲及护胸姿态；半直立成长结构保留，整体更幼年 | [原稿](../coal-guard-pixel-v3/sprite-original.png)、[提示词](../coal-guard-pixel-v3/prompt-used.txt) |
| 熔炉兽 v2 | 保留巨臂撑地、炉心胸口与肩背结构；头部改为宽颅厚眉、窄眼、方颌露齿，头颈与巨兽身躯衔接 | [原稿](../furnace-beast-pixel-v2/sprite-original.png)、[提示词](../furnace-beast-pixel-v2/prompt-used.txt) |

`preview-original.png`为清晰原稿合览，从左到右为灯翅蛾、炉甲獾、熔炉兽；`preview-64.png`为64像素导出合览。

使用内置image_gen，分别引用前版立绘进行重绘。generate2dsprite清理品红背景并通过严格QC；各目录保留raw.png、prompt-used.txt、sprite-original.png、sprite-64.png、preview-512.png、pixel-qc.json及export/pipeline-meta.json。三只统一64×64 RGBA、24种不透明颜色、透明度0／255、最长边56像素、底部y=59、安全边至少4像素。已查看原稿和64像素合览，主体完整，未见品红残留。

此前版本保留为历史候选。2026-10-25用户确认接入后，使用本轮清晰透明原稿，分别绑定 `public/lantern_moth.png`、`public/coal_guard.png`、`public/furnace_beast.png`，同步美术素材副本。图鉴、队伍、战斗、布阵及进化预览共用物种图片；战斗和布阵直接显示原稿，不经64像素画布重采样。旧存档缺失图片时仅补路径，不重算属性技能。

验证：47项相关测试、类型检查和构建通过；横屏手机六种尺寸共30例、桌面三种尺寸共15例实际渲染通过，已抽查布阵、战斗及图鉴截图。报告与截图位于 `dump/coal-moth-revised-mobile/`、`dump/coal-moth-revised-desktop/`。三张图的public、dist和美术素材副本内容一致。手机真机尚未验证。

美术要求已同步项目AGENTS.md、统一美术规范，并按用户要求写入记忆补充。未改技能数值、进化路线，未重新打包APK、提交或发布。
