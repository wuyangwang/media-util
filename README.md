# 媒体工具箱（Media Utility）

基于 Tauri v2 + React 构建的跨平台桌面媒体处理工具，支持批量视频转码、图片处理与打包导出。

## 功能特性
- 批量视频与图片处理：按任务队列顺序执行，避免并发资源冲突。
- 视频转码：支持 `720p`、`1080p`、`2K` 预设。
- 图片处理：支持裁剪（固定尺寸 / 比例 / 自定义）与格式转换。
- 拖拽导入：支持拖入文件与文件夹。
- 递归扫描：自动扫描子目录中的可处理媒体文件。
- 批量导出：可逐个保存或打包为 ZIP。
- 系统托盘：支持右下角托盘菜单（关于、打开、设置、退出）。
- 退出机制：右上角关闭按钮改为最小化到托盘，实现后台运行。
- 实时进度：任务级状态和进度反馈。
- 主题切换：浅色 / 深色 / 跟随系统。

## 技术栈
- 前端：React 19、TypeScript、TanStack Router、Tailwind CSS v4、shadcn/ui
- 桌面容器：Tauri v2
- 后端：Rust
- 媒体引擎：FFmpeg / FFprobe（Tauri sidecar）

## 本地开发
```bash
pnpm install
pnpm tauri dev
```

## 构建与打包
```bash
# 前端构建
pnpm build

# Windows 安装包（NSIS + MSI）
pnpm pack:win
```

`pack:win` 当前会生成安装包（而非仅可直接运行的裸 exe）：
- `NSIS`: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe`
- `MSI`: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/*.msi`

## GitHub Actions 发布
仓库内已配置 Windows 构建发布工作流：
- 文件：`.github/workflows/release.yml`
- 触发：推送到 `master`
- 发布产物：`NSIS exe` + `MSI`

## 当前状态
- [x] 侧边栏路由结构
- [x] 视频转码（720p/1080p/2K）
- [x] 图片裁剪与格式转换
- [x] 批量扫描与 ZIP 导出
- [x] 主题切换（浅色/深色/系统）
- [x] Windows 安装包发布链路
