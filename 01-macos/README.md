# Mac 入口

先安装 Node.js 22 / 24 LTS 和电脑微信。保留完整项目目录，双击下列文件：

| 文件 | 操作与结果 |
| --- | --- |
| [setup.command](setup.command) | 首次安装，等待 `Setup complete` |
| [start.command](start.command) | 选择地点，粘贴微信 URL / openId 并回车；验证后显示姓名和 ID |
| [manage-locations.command](manage-locations.command) | 按菜单增改地点，保存后下次启动选择 |
| [get-openid.command](get-openid.command) | 粘贴 URL 并回车，只显示 ID，不签到 |

粘贴通常用 `Command+V`。每次启动均需粘贴并回车。

[完整操作及终端状态](../README.md)
