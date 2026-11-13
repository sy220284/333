# Android Node runtime 源码溯源
本目录脚本按 `sy220284/777` main `41b2559f90f0f732799cd17bbd003e8a71cb2020` 复制，来源：
- `tools/runtime/prepare-termux-node.sh`
- `tools/runtime/verify-termux-signature.sh`
- `tools/runtime/runtime-download.sh`

原仓 MIT License，Copyright (c) 2026 DSH Mobile contributors。保留此版权及许可证告知。脚本中 ROOT_DIR 为两级父目录；放在 `安卓端方案/tools/runtime` 时正好指向 `安卓端方案`，无需修改源码路径。

安全：构建时先验证 Termux InRelease 签名及固定公钥指纹，再用该仓库索引的 SHA256 验证全部 deb。提取后对 ELF 16 KiB 对齐与 NEEDED 动态库依赖进行核验。打包到 APK 前仍需用 runtime-manifest 将 payload 与源码、ABI、运行时版本锁定。仅在 CI 使用这些联网脚本；终端用户 APK 安装不在首次启动时下载 Node。
