# 项目结构与运行流程

[返回项目主页](../README.md) · [详细使用指南](usage.md)

## 按层理解项目

| 层次 | 目录或文件 | 职责 |
| --- | --- | --- |
| 系统入口 | `01-macos/`、`02-windows/` | 切换到项目根目录，再调用对应 npm 命令 |
| 配置管理 | `scripts/configure.cjs` | 迁移单地点配置，管理多个地点，选定本次坐标 |
| 程序入口 | `src/index.ts` | 获取或更新登录凭据，循环查询签到，处理主动更换凭据 |
| 终端与运行控制 | `src/terminal.ts`、`src/control.ts` | 接收直接粘贴、R/Q 命令，取消旧请求与等待，隔离旧响应 |
| 身份输入 | `src/openid.ts` | 解析用户粘贴的可信域名链接或裸 openId |
| 单独获取工具 | `src/acquire-openid.ts` | 等待终端粘贴、提取并显示 openId，不访问网络或执行签到 |
| 签到调度 | `src/sign.ts` | 根据 `isQR` / `isGPS` 显示类型并选择处理流程 |
| 普通与定位请求 | `src/requests.ts` | 调用微助教的身份、签到查询和提交接口，并检查响应结构 |
| 网络与错误分类 | `src/http.ts`、`src/status.ts` | 请求超时、HTTP 与业务错误分类、中文状态及操作建议 |
| 二维码流程 | `src/QRSign.ts` | 订阅二维码更新，显示二维码并监听签到结果 |
| 实验性微信调试 | `src/cdp.ts` | 上游保留的 CDP 实验代码，当前入口不再连接或获取凭据 |
| 公用设置与工具 | `src/consts.ts`、`src/utils.ts` | 加载配置、通知、等待等 |
| 运行产物 | `dist/` | TypeScript 编译结果，结构对应 `src/` |
| 验证 | `tests/` | 无需账号、不会提交真实签到的离线测试 |

## 默认启动流程

```text
01-macos/start.command 或 02-windows/start.cmd
  → npm start
  → prestart：scripts/configure.cjs
  → 选择定位预设并写入 config.json
  → dist/index.js
  → 等待终端粘贴微信签到链接或 openId 并回车，再验证身份
  → 查询活动签到
  → 普通 / 定位请求，或二维码流程
  → 持续查询；凭据失效时等待再次粘贴并回车
```

地点管理将 `selectedLocation` 对应地点的坐标同步到 `lat`、`lon`，签到逻辑读取这两个字段。业务进程启动时加载配置；运行途中改配置不会热更新，切换地点需重新启动。

`config.json` 中的 `locations` 保存 `{ name, lat, lon }` 列表。配置仅存储在本机，并被 Git 忽略。`examples/config.example.json` 是未填写坐标的起始模板，首次运行也可自动生成配置。上游旧示例放在 `examples/legacy/`，不作为默认坐标来源。

## 系统适配

- macOS 入口使用 zsh；在终端粘贴并回车。
- Windows 入口使用 CMD；在终端粘贴并回车，不依赖 PowerShell 读取剪贴板。
- 两套入口调用同一份 `package.json`、`src/` 和 `config.json`，无需维护两套业务代码。
- 终端命令须在项目根目录执行；双击入口会自动切换目录。复制系统入口目录时必须同时保留其父目录中的项目文件。

## 开发与验证

修改 `src/` 后执行 `npm run build`。修改 `scripts/` 下的 `.cjs` 文件不需要 TypeScript 编译。`npm test` 会先编译，再发现并运行所有离线测试。

| 测试文件 | 主要验证内容 |
| --- | --- |
| `tests/openid.test.cjs` | 可信链接与裸 ID 解析，拒绝无效或歧义输入 |
| `tests/locations.test.cjs` | 选择与保存、旧配置迁移、管理操作、取消和无效配置 |
| `tests/requests.test.cjs` | 身份缺失、姓名响应、签到业务错误及查询数据校验 |
| `tests/status-http.test.cjs` | HTTP / 网络 / 业务错误分类、超时与重试提示、状态显示 |
| `tests/session.test.cjs` | 每次启动等待粘贴、忽略旧环境配置、网络重试、授权拒绝、直接粘贴替换、取消旧请求、正常等待及二维码恢复 |
| `tests/terminal-control.test.cjs` | 直接粘贴无需切换、命令识别、无效内容保护、取消等待 |

测试通过不代表当前微助教接口或真实签到可用。Windows 尚未实机验证。

## 文件维护约定

- `README.md` 为当前版本唯一的入门主页，详细操作集中在 `docs/usage.md`。
- `docs/upstream/README.md` 和 `examples/legacy/` 保留上游资料，不能代替当前使用说明。
- 使用 npm 与 `package-lock.json` 安装依赖；`yarn.lock` 是保留的上游锁文件。
- 修改源码后同步编译产物；不要把个人登录链接、`config.json`、`node_modules/` 或 `.npm-cache/` 提交到版本库。
