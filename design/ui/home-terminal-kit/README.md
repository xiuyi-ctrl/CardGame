# 首页终端 UI 素材拆分

本目录只保存无文字的像素 UI 素材。菜单文字、字号、颜色和禁用状态应由 React/CSS 实时渲染，不得烘焙进图片。

## 边框

- `terminal-frame.png`：终端外框与空白内容底板
- `menu-row-normal.png`：普通主菜单按钮框
- `menu-row-selected.png`：橙色选中主菜单按钮框
- `utility-button-frame.png`：底部方形功能按钮框

## 图标

`frames/` 下每张图片均为独立透明 PNG：

- `continue-backpack.png`
- `new-map-flag.png`
- `proficiency-chart.png`
- `codex-book.png`
- `save-archive.png`
- `achievement-trophy.png`
- `settings-gear.png`
- `exit-door.png`
- `chevron-right.png`
- `paw-status.png`

`raw/` 与 `icons-processed/` 保留生成原图和拆分过程文件，运行时不要直接引用。
