# 御三家最高进化：大幅改形v2

2026-10-25。使用内置image_gen重绘并统一导出，已按用户要求接入游戏。

`preview.png`从左到右为迅天、泡泡龙神、灼天，使用64像素成品作4倍最近邻放大，不是高清原稿预览。

- [迅天当前成品](../xuntian-pixel-v2/export/raw-sheet-clean.png)／[完整提示词](../xuntian-pixel-v2/prompt-used.txt)：风翼四足空兽。
- [泡泡龙神当前成品](../paopaolongshen-pixel-v2/export/raw-sheet-clean.png)／[完整提示词](../paopaolongshen-pixel-v2/prompt-used.txt)：厚重水龙守护者。
- [灼天当前成品](../zhuotian-pixel-v2/export/raw-sheet-clean.png)／[完整提示词](../zhuotian-pixel-v2/prompt-used.txt)：黑曜熔焰翼龙。

三张成品均为64×64透明RGBA，23种不透明颜色，主体最长边56像素，底部y=59，透明度0／255。已目视检查原稿和整数倍预览；处理器无空帧、触边或粘贴裁切。

v1保留用于对比；v2已接入 `public/01-2.png`（迅天）、`public/03-2.png`（泡泡龙神）、`public/02-2.png`（灼天），并同步对应美术素材副本。物种图片路径、数值与技能不变，已有存档不需迁移。手机安装包需要后续重新打包才包含新图，本次未生成APK，也未提交／发布。

2026-10-25后续修正：用户要求改用图四那套原图效果。上述运行时路径现使用未缩小、未减色的高清透明稿，并针对这三只在 `PixelCreature` 中直接显示原图，避免战斗／布阵再次采样至64×64。`preview.png`和上述64像素QC是历史导出记录，不代表当前运行时清晰度；当前成品以本页链接为准，其他生物的像素采样不变。

修正后素材／战斗／布阵20项回归与生产构建通过，构建产物内三张图片与透明原稿一致。实际渲染覆盖六种横屏手机尺寸30组、三种桌面尺寸15组，均无裁切、操作遮挡、横向溢出或渲染错误。记录位于 `dump/legend-original-mobile/`、`dump/legend-original-desktop/`，使用独立夹具查看三只图鉴详情、战斗与布阵，不访问真实存档。APK尚未重新打包。
