# 当前状态

更新：2026-10-28

## 进度

- 包名 `dsh-resend-editor`（`dsh-edit-resend` 在 npm 已被他人占用，2026-10-28 改名；本地目录名未改）。
- v0.1.1：编辑任意用户消息（含第一条），改文字、删图、拖动排序、补图，发送前按 imageLimits 校验；原会话归档；界面语言跟随 DSH 设置。
- 已在隔离测试环境（DSH 0.2.1-rc.3 web profile + 假模型）验证：普通消息 fork 重发、第一条开新会话、10 图长文本、超 20 张拦截、拖入文件不泄漏到官方输入框、中英文切换、从打包文件全新安装。
- 本机 desktop profile 以 link 方式安装；`cordis.patch.yml` 末尾 `id: recall disabled: true` 停用 dsh-recall-plugin（未卸载，改前有 `.bak-*` 备份）。

- v0.2.0（本地，未发布）：复制带图片消息时连图片一起复制。剪贴板写 text/plain + text/html（图片内嵌 data URI，带 `data-der-copy` 标记）；插件内存记下原始文件，粘贴到官方输入框（`[data-composer-card]`）或编辑卡时按原顺序补成附件。已在测试环境用替身剪贴板验证（内置浏览器禁用剪贴板）；真实剪贴板待桌面版实测。

## 发布

- GitHub 公开仓库 https://github.com/thirteenkai/dsh-resend-editor （2026-10-28 创建；提交作者用 noreply 邮箱，本仓库 git config 已设）。本环境 SSH 密钥不可用，推送用 `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push`。
- npm `dsh-resend-editor@0.1.1` 已发布（账号 kaypeng，发布需 2FA，由本人在终端执行 `npm publish`）。已在全新 DSH_HOME 用 `dsh plugin add dsh-resend-editor` 验证安装与编辑重发。
- 以后发版：改 `package.json` version → 提交推送 → 本人 `npm publish`。

## 待办

- 收录到 awesome-dsh-plugin：仓库需创建满 1 天（2026-10-29 11:24 北京时间后）再提 PR，新增 `data/plugins/thirteenkai__dsh-resend-editor.yml`，category `session`。列表里已有多个编辑重发类插件（limbo947/dsh-recall-plugin、xt765/dsh-message-edit、sh1robana/dsh-plugin-message-edit 等），描述要写清差异：附件删除/拖动排序、发送前 imageLimits 校验、第一条消息可编辑。

## 关键实现判断

- 不复刻官方消息气泡：包装 `conversation.chat.node`（key `user`），渲染官方 `UserMessageNodeView` 并补上它需要的 `t`（按注册项 locale 绑定），编辑按钮以 DOM 方式插进官方操作行。
- 切点在客户端算：用户消息 `data.seq` 落在所属轮次 `turn/start` 之后；取 `end.seq < 消息 seq` 的最大轮次结束点 fork。没有更早的结束点且已加载最早一轮是第 1 轮 → 第一条。
- 官方输入框乐观清空草稿、宿主提交后才校验图片限制，所以超限必须在编辑卡里提前拦。
- 界面语言读 locale 服务快照的 `active`：桌面版以 `--lang=en-US` 启动，`navigator.language` 不可信。
