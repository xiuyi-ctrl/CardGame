# 狐火专属状态图标

设计：浅金狐面、双尖狐耳、橙金卷尾火焰，深色像素描边。与普通灼烧的单簇火焰区分，不绘制层数，供三阶火狐共用。

- `fox-fire.png`：128×128 透明 PNG，推荐接入源文件。
- `fox-fire-32.png`：32×32 透明 PNG。
- `readability-16x.png`：16×16 最近邻缩小后放大至128×128的辨识检查图，不用于接入。
- `raw-icon.png`：内置 image_gen 生成原稿；`prompt-used.txt` 保留完整提示词。
- `processed/`：generate2dsprite 确定性去底、缩放和 QC 产物；无越界、空帧或裁切。

已接入：源文件同步复制至 `public/buff-icons/fox-fire.png` 与 `美术素材/buff-icons/fox-fire.png`，`src/ui/BuffIcon.tsx` 中 `STATUS_ART.foxFire` 的资源名已由 `burn` 改为 `fox-fire`。战场状态、Buff详情及预加载共用此映射；层数继续由现有界面文字绘制。普通灼烧仍使用 `burn.png`，不修改玩法或图标尺寸。
