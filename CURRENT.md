# 当前状态

更新：2026-10-28

## 进度

- 包名 `dsh-resend-editor`（`dsh-edit-resend` 在 npm 已被他人占用，2026-10-28 改名；本地目录名未改）。
- v0.1.1：编辑任意用户消息（含第一条），改文字、删图、拖动排序、补图，发送前按 imageLimits 校验；原会话归档；界面语言跟随 DSH 设置。
- 已在隔离测试环境（DSH 0.2.1-rc.3 web profile + 假模型）验证：普通消息 fork 重发、第一条开新会话、10 图长文本、超 20 张拦截、拖入文件不泄漏到官方输入框、中英文切换、从打包文件全新安装。
- 本机 desktop profile 现以 link 方式装本目录（2026-10-28 16:52 为实测 0.3.0 重新 link；此前 11:48 曾被 GUI 换成 npm `^0.1.1`，导致复制不带图）。发布后想换回 npm 版：`dsh plugin --profile desktop add dsh-resend-editor@<版本>`。DSH 的 pnpm 有最小发布时长限制，CLI 指定版本时会自动写入 `minimumReleaseAgeExclude`；`cordis.patch.yml` 末尾 `id: recall disabled: true` 停用 dsh-recall-plugin（未卸载，改前有 `.bak-*` 备份）。

- v0.2.0（2026-10-28 已发布 npm，GitHub 已推送）：复制带图片消息时连图片一起复制。剪贴板写 text/plain + text/html（图片内嵌 data URI，带 `data-der-copy` 标记）；插件内存记下原始文件，粘贴到官方输入框（`[data-composer-card]`）或编辑卡时按原顺序补成附件。已在测试环境用替身剪贴板验证（内置浏览器禁用剪贴板）；桌面版用户实测粘贴正常。
- v0.2.0 同版本还加了官方输入框附件拖动排序：MutationObserver 给 `[data-composer-card] [data-slot="conversation.input.attachments"] [role="group"]` 的子项加 draggable，drop 时对主会话 shell 做「全部 removeAttachment（不释放）→ 按新顺序 addAttachments」。条目数与 attachmentIds 不一致时不动（避免误改其他输入框）。测试环境已验证拖动、点击预览、发送顺序。

- v0.3.0（2026-10-28 本地完成，未推送、未发布）：
  - 对话图片复制／下载／拖进输入框：DOM 层识别 `[data-conversation-content]` 里「按钮只包一张 img、≥40px」的图片（官方画廊 + 回复里的 Markdown 图片），悬停浮出工具栏；灯箱（`[role=dialog][aria-modal]` 且只有一张 img）右上角补按钮。复制用 `ClipboardItem({'image/png': Promise})`，非 PNG 先经 canvas 转 PNG；下载用 `<a download>`（桌面主窗口 session 没有 will-download 拦截，应弹保存框——待桌面实测）。拖动用自定义类型 `application/x-der-image`，只在官方输入框卡片或编辑卡上接收。
  - @ 引用图片：向 `ctx.get('inputTriggers').registerSource` 注册 `@der-image`，并挪到 `@reference` 前面；候选来自 `conversation.draftAttachments.get(id)`（只数图片）。chip 的 ref 为 `der-image:<sessionId>:<attachmentId>`，label 是文件名（用户要求不显示图N），提交时 `codec.serialize` 同步读附件写成【文件名】，有同名图时写【图N 文件名】（模型收到的每张图都带 `Image "文件名"` 说明，靠名字对应）；图不在了就 reject（官方显示错误并保留草稿）。订阅 `shell.state`，附件变化时用 `shell.actions.setDraft({text, references})` 重写 chip 的 label／clipboardText／invalid。官方 @ 只在行首或空白后触发。
  - 紧跟文字的 `@`：官方 `activeAtToken` 只认 `(?:^|\s)@`（标点后也不行），中文「奶奶@」不弹菜单。插件读 `shell.projection`（detectText/caret）自行识别，弹只列图片的浮层，选中后 `shell.insertReference(insert, {start, end, draftRev})` 插官方 chip（span 取自 `actions.captureInsertion()`）。@ 前是 ASCII 字母数字或邮箱符号时不弹（防邮箱误弹），@ 后按文件名或序号筛选；按键捕获在 document 上先于编辑器，按键时若检查还没跑先同步跑一次（否则快速回车会直接发送）；Esc 按「@ 及之前文字」记忆，不按位置。
  - 输入框附件条图片左下角序号；编辑卡里 `@` 弹出图片选择、插入【图N】，调整顺序／删图时正文【图N】自动改号，删掉的变【图?】并拦截发送。
  - 编辑重发不再归档原会话（用户要求：编辑后应是 fork 出的新聊天，原聊天原样保留）。编辑后的消息上「↩ 原对话」：localStorage `dsh-resend-editor:origins` 记 `{新会话: {from, after}}`；兼容旧版本归档过的原会话（归档会话不能直接打开，先 `uiWorkspace.unarchiveSession` 再 `openSession`）。
  - 文档级监听改为经 `ctx.effect` 注册、可撤销；热重载时旧 ctx 失效会自行停掉观察器。
  - 测试环境已验证：Markdown 图片与多图缩略图的悬停栏、复制（替身剪贴板，含 JPG→PNG）、下载文件名、灯箱按钮不关灯箱、拖入输入框／编辑卡、@ 菜单排序与缩略图、chip 随拖动重编号、删图标红并拦截、实际发出文字为【图N】、编辑卡 @ 与改号、原对话按钮恢复归档并打开、热重载无残留；紧跟文字的 @（快速输入后立即回车、方向键＋Tab、Esc 后不复弹、邮箱不误弹、空格后的 @ 只出官方菜单、发出文字为【图N】）。之后又验证：编辑 4 条会话的第 2 条后原会话未归档、4 条完整，新会话为第 1 条＋改过的第 2 条；@ 菜单／chip 显示文件名，同名图发出【图3 image.png】，邮箱 `kay@` 不弹，编辑卡 @ 插入【文件名】。真实剪贴板与下载保存框需在桌面版实测。
- 假模型（dev/mock-llm.mjs）支持「读图 <路径>」触发 read_image、「出图 <路径>」回复 Markdown 图片。

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
