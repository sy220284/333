# 摇摇车 Desktop

桌面版基于 Electron、React、TypeScript 和现有 desktopHost。

## 开发

1. 在仓库根目录构建后端 `desktopHost` 与 `yaoyaoche`。
2. `cd desktop && npm install`
3. `npm run dev` 启动桌面工作台。
4. `npm run build` 构建桌面前后端桥接与静态界面。
5. `npm run package:win`、`npm run package:mac` 或 `npm run package:linux` 打包对应系统安装程序。

桌面主进程仅暴露受限 IPC，工作区文件操作受路径限制，危险权限模式通过系统弹窗确认。生产发行前需实测各平台独立安装、后台可执行程序路径和全套功能。

[Figma 九页设计稿](https://www.figma.com/design/7tMuuOySLcOEtoKYftLuEV)

## Linux 安装与中文字形

`npm run package:linux` 生成可执行的 AppImage 和 Debian DEB 安装包。DEB 将 `fonts-noto-cjk` 作为系统依赖，安装后中文界面可正常显示。

AppImage 不会自动安装系统字体。若使用极简 Linux 或容器桌面，界面出现中文方框，请先安装中文字体，例如 Ubuntu/Debian 执行：

```bash
sudo apt-get update
sudo apt-get install fonts-noto-cjk
```

无需下载或替换私有字体文件。项目 CI 会在有中文字体的图形环境中实际打开已打包桌面版，并验证工作台、智能体团队和长期任务页面，保存安装包与截图供复核。

当前自动安装及图形启动验收使用 Linux x64；Windows/macOS 的构建与安装包还需要分别开展原生图形启动验证。三模式工作项如可能同时修改同一文件，建议先采用独立 Git Worktree 并审核结果，避免工作项之间互相覆盖。
