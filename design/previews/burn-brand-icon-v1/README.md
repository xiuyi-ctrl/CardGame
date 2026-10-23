# 灼烧烙印专属图标

- 文件：`burn-brand.png`，64×64透明PNG，建议在战斗状态栏按现有24px规格显示。
- 造型：炭黑菱形烙印、金色中心符记、橙红附着火焰；区别于普通灼烧的单火苗和暗影印记的紫色眼睛。
- 使用内置image_gen生成原图，generate2dsprite脚本仅用于去品红底、裁切、缩放及透明导出；提示词见`prompt-used.txt`，原图与QC记录保留在本目录。
- 严格QC：无空白帧、无边缘裁切、无贴图越界。已查看透明成品。
- 已接入`STATUS_ART.burnBrand`，使用独立`/buff-icons/burn-brand.png`，同步public与美术素材副本；电脑、手机战场及状态详情共用，自动纳入预加载。原暗影印记仍使用shadow-mark.png，不覆盖原文件，不改状态排序和最多3个图标规则。不生成APK、不提交GitHub。
