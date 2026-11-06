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
