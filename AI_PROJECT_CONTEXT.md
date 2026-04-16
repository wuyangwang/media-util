# AI Project Context - Media Utility (v0.9.0)

> 目的：为人类开发者与 AI 编码代理提供统一、可执行、可持续维护的项目上下文。

## 1. 项目定位
Media Utility 是一个桌面端媒体处理工具，目标是以低学习成本完成日常视频转码和图片处理任务。

核心价值：
- 快速：拖拽导入、批量处理、自动输出。
- 稳定：顺序队列执行，降低失败率。
- 直观：任务状态可视化、即时反馈。

## 2. 当前版本与里程碑
- 当前版本：`v0.9.0`
- 已落地里程碑：
1. 路由 + 侧边栏信息架构。
2. 视频转码预设链路（720p/1080p/2K）。
3. 图片裁剪与格式转换。
4. 批量扫描 + ZIP 打包导出。
5. 主题切换（浅色 / 深色 / 跟随系统）。
6. Windows 安装包工作流（NSIS + MSI）。

## 3. 技术与架构
- 前端：React 19 + TypeScript + TanStack Router + Tailwind v4 + shadcn/ui。
- 桌面壳：Tauri v2。
- 后端：Rust 命令式接口（Tauri commands）。
- 媒体能力：FFmpeg / FFprobe sidecar（`src-tauri/binaries/`）。

关键路径：
1. 前端收集任务并触发 Tauri 命令。
2. Rust 调用 sidecar 处理媒体。
3. 通过事件回传进度。
4. 前端更新 UI 与提示。

## 4. 目录约定（高频）
- `src/routes/`：页面路由（overview/videos/images/settings）。
- `src/hooks/`：任务扫描与业务 Hooks。
- `src/components/ui/`：shadcn/ui 组件封装。
- `src-tauri/src/media.rs`：媒体处理核心逻辑。
- `src-tauri/tauri.conf.json`：Tauri 打包、sidecar、窗口配置。
- `.github/workflows/release.yml`：Windows 自动发布流程。

## 5. 构建与发布规范
本地常用命令：
```bash
pnpm install
pnpm tauri dev
pnpm build
pnpm pack:win
```

发布目标：
- 安装包格式：`nsis`、`msi`
- 不再将 `release/*.exe` 作为最终发布入口
- sidecar 由安装包统一携带

## 6. 质量基线
默认要求：
1. 小步提交，避免大而杂的 diff。
2. 改动后至少执行一次 `pnpm build`。
3. 业务行为变更必须在 PR/提交说明中明确“为什么改”。
4. 清理类任务优先“删除冗余”而非“叠加抽象”。

## 7. 后续优化队列（建议）
1. 抽离通用任务扫描/队列 Hook（减少 videos/images 重复逻辑）。
2. 增强拖拽区状态反馈（hover/active/overlay）。
3. 强化失败诊断信息（错误栈、可复制日志、重试建议）。
4. 优化大体积前端 chunk（按路由拆包）。

## 8. 给 AI 代理的执行提示
- 先读本文件，再读 `README.md` 与 `AGENTS.md`。
- 涉及打包发布时，优先检查：
1. `package.json` 的 `pack:win`
2. `src-tauri/tauri.conf.json` 的 `bundle.targets` / `externalBin`
3. `.github/workflows/release.yml` 的发布文件路径
- 涉及主题问题时，优先检查：
1. `src/main.tsx` 的 `ThemeProvider`
2. `src/routes/settings.tsx` 的主题切换逻辑
3. `src/index.css` 的 `:root` 与暗色变量覆盖关系
