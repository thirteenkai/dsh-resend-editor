# 当前状态

更新：2026-10-28

## 进度

- 包名 `dsh-resend-editor`（`dsh-edit-resend` 在 npm 已被他人占用，2026-10-28 改名；本地目录名未改）。
- v0.1.1：编辑任意用户消息（含第一条），改文字、删图、拖动排序、补图，发送前按 imageLimits 校验；原会话归档；界面语言跟随 DSH 设置。
- 已在隔离测试环境（DSH 0.2.1-rc.3 web profile + 假模型）验证：普通消息 fork 重发、第一条开新会话、10 图长文本、超 20 张拦截、拖入文件不泄漏到官方输入框、中英文切换、从打包文件全新安装。
- 本机 desktop profile 以 link 方式安装；`cordis.patch.yml` 末尾 `id: recall disabled: true` 停用 dsh-recall-plugin（未卸载，改前有 `.bak-*` 备份）。

## 待办

- 公开发布：GitHub 公开仓库 `thirteenkai/dsh-resend-editor` + npm 包 `dsh-resend-editor`。发布前需要：npm 登录（本人执行 `npm login`）；推送前用 GitHub noreply 邮箱重建提交，避免公开个人邮箱。

## 关键实现判断

- 不复刻官方消息气泡：包装 `conversation.chat.node`（key `user`），渲染官方 `UserMessageNodeView` 并补上它需要的 `t`（按注册项 locale 绑定），编辑按钮以 DOM 方式插进官方操作行。
- 切点在客户端算：用户消息 `data.seq` 落在所属轮次 `turn/start` 之后；取 `end.seq < 消息 seq` 的最大轮次结束点 fork。没有更早的结束点且已加载最早一轮是第 1 轮 → 第一条。
- 官方输入框乐观清空草稿、宿主提交后才校验图片限制，所以超限必须在编辑卡里提前拦。
- 界面语言读 locale 服务快照的 `active`：桌面版以 `--lang=en-US` 启动，`navigator.language` 不可信。
