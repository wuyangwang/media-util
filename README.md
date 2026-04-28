# 媒体工具箱（Media Utility）

基于 Tauri v2 + React 构建的跨平台桌面媒体处理工具，支持批量视频转码、图片处理与打包导出。

## 功能特性
- 批量视频与图片处理：按任务队列顺序执行，避免并发资源冲突。
- 视频处理增强：
  - **视频转码**：支持 `720p`、`1080p`、`2K` 预设。
  - **一键压缩**：使用 CRF 28 智能平衡体积与画质。
  - **音频提取**：一键将视频转换为 `MP3` 或 `WAV` 音频。
- 图片处理：支持裁剪（固定尺寸 / 比例 / 自定义）与格式转换。
- **本地语音转写**：
  - **多模型支持**：支持 Whisper (Medium/Large) 与 SenseVoice (Int8) 模型，适配不同性能设备。
  - **双格式输出**：自动生成「纯文本」与「带时间戳」两个版本的转写文件。
  - **模型管理**：支持模型的在线下载、自动更新与离线删除。
- **性能优化**：自动检测系统 CPU 核心数，动态分配线程（保留 1 核心给 UI），最大化处理效率。
- **全局拖拽导入**：在应用任何界面拖入文件/文件夹，自动识别类型并跳转到对应页面。
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

## 致谢
本项目的发展离不开开源社区的支持，特别感谢：
- [Handy](https://github.com/cjpais/Handy)：提供了优秀的实现思路，特别是其 ASR 模型的下载地址。

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

## 开发校验与格式化
代码变更后，建议按以下顺序执行：

```bash
# 格式化
pnpm format
cargo fmt --manifest-path src-tauri/Cargo.toml

# 验证
cargo check --manifest-path src-tauri/Cargo.toml
pnpm build
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
- [x] 视频音频提取与一键压缩
- [x] 智能 CPU 资源调度
- [x] 本地语音转写 (Whisper/SenseVoice)
- [x] 图片裁剪与格式转换
- [x] 批量扫描与 ZIP 导出
- [x] 全局拖拽文件分流
- [x] 主题切换（浅色/深色/系统）
- [x] Windows 安装包发布链路

## 开源协议
本项目采用 [MIT License](LICENSE) 开源协议。
Copyright (c) 2026 @tardis
