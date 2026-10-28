# dsh-resend-editor

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件：编辑已发出的消息，然后重发。

发出去 10 张图加一大段文字，才发现图放错了、字写错了？不用重新复制文字、再一张张拖图：点消息下方的 ✎，原文和图片会原样出现在消息位置的编辑卡里，改完直接发。

[English](#english)

## 能做什么

- 改文字（预填原文）
- 删图片：缩略图右上角 ×
- 调整顺序：拖动缩略图，左下角序号就是发送顺序
- 补图片或文件：点 `+`、往卡片里拖，或在文字框里粘贴
- 在文字里键入 `@` 选图，插入【文件名】（同名图写成【图N 文件名】）
- `⌘↵` 发送，`Esc` 取消
- 发送前按会话的图片限制校验（张数、单张大小、总大小、格式），超限直接提示
- 界面语言跟随 DSH 设置（中文 / English）

## @ 引用图片

提示词里不用再写「图一是情景，2 是豆包奶奶……」：在官方输入框里键入 `@`，菜单最上面是待发送的图片（缩略图 + 文件名），选中后插入一个 `@豆包奶奶.png` 标签。

- 输入文件名的一部分即可筛选，如 `@豆包`。
- 发给模型的文字里，标签写成【豆包奶奶.png】。模型收到的每张图都带着文件名，所以能对上；有同名图（如几张截图都叫 image.png）时自动带上序号，写成【图3 image.png】，序号即输入框里图片左下角的数字。
- 引用的图被删掉，标签标红，发送时拦下。
- 中文里 `@` 紧跟在文字后面（如 `奶奶@`）也能用：官方菜单只认行首或空格后的 `@`，这种情况由插件弹一个只列图片的小菜单，`↑↓` 选择、回车或 Tab 插入、Esc 关闭。`@` 前面是英文字母或数字时（如邮箱 `kay@`）不弹。

## 图片复制、下载、拖进输入框

对话里的图片——自己发的、DeepSeek 生成后在回复里展示的、工具读取的——鼠标悬停时右上角出现「复制」「下载」；点开大图预览时右上角也有这两个按钮。

- 复制：写入剪贴板的是图片本身（PNG），可以直接粘贴到输入框、微信、飞书、设计软件。
- 下载：按原文件名保存。
- 直接把对话里的图片拖到下方输入框（或编辑卡），会作为附件加进去，不用先另存。

## 输入框附件拖动排序

官方输入框里待发送的图片和文件也可以直接拖动调整顺序，发送时按新顺序发出。点缩略图仍然是查看原图。

## 复制带图片

点带图片消息下方的官方复制按钮，复制的是整条消息，不只是文字：

- 粘贴到 DSH 输入框或编辑卡：文字照常粘贴，图片（和文件）按原顺序自动加回附件——适合把一条消息挪到另一个会话再发。
- 粘贴到飞书、备忘录等富文本编辑器：贴出图文（剪贴板里是内嵌图片的 HTML）。
- 纯文本的地方只得到文字；剪贴板一次只能放一张图片数据，多图消息无法以「图片」格式整体粘到只收图片的地方。
- 没有附件的消息仍走官方复制，行为不变。

## 发送后会发生什么

| 编辑的是 | 做法 |
| --- | --- |
| 第二条及以后 | 从上一轮结束处 fork 出一个新聊天（带着之前的对话），把改后的内容发出去 |
| 第一条 | 前面没有可切的轮次，在同一工作区开一个新聊天发出去 |

原聊天原样保留，侧栏里会多一个新聊天。例如聊了 10 条后编辑第 2 条：新聊天里是第 1 条 + 改过的第 2 条，原聊天的 10 条一条不少。新聊天里编辑后发出的那条消息下方有「↩ 原对话」，点一下跳回原聊天。只分叉对话，不改动工作区文件。

## 安装

在终端执行（macOS 桌面版）：

```bash
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add dsh-resend-editor
```

完全退出 DSH（⌘Q）后重新打开。

> 如果装了 [dsh-recall-plugin](https://www.npmjs.com/package/dsh-recall-plugin)，它也会在消息上加编辑按钮，两者同时启用会冲突。在 `~/.dsh/profiles/desktop/cordis.patch.yml` 末尾加上下面两行停用它（不需要卸载）：
>
> ```yaml
> - id: recall
>   disabled: true
> ```

## 已知限制

- 只处理普通用户消息；Agent 运行中插话发送的消息不显示编辑按钮。
- 编辑第一条时开出的新会话使用默认模型，不继承原会话里切换过的模型。
- 「↩ 原对话」的对应关系只记在本机，换电脑或清除应用数据后不再显示（原聊天仍在侧栏里）。
- 依赖 DSH 尚未公开稳定的客户端接口，DSH 升级后可能需要更新插件。已验证版本：0.2.1-rc.3。

## 开发

`dev/` 下是隔离测试环境：本地假模型（OpenAI 兼容）+ 独立 `DSH_HOME` 的 web profile，不碰真实会话。给假模型发「读图 <绝对路径>」会触发一次 read_image 工具调用，「出图 <绝对路径>」会回复 Markdown 图片。

```bash
node dev/mock-llm.mjs 43125
```

```bash
DSH_HOME=/tmp/dsh-test DSH_MOCK_KEY=mock "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" --profile web --patch dev/test-patch.yml --no-open --port 43126
```

然后用 `dsh plugin --profile web add link:<本仓库路径>`（同样带 `DSH_HOME`）装进测试 profile，打开终端打印的带 token 的地址。

调试：在 DSH 页面控制台执行 `localStorage.setItem('dsh-resend-editor:debug','1')` 后刷新，可用 `window.__dshResendEditor.ctx` 查看运行时服务。

## English

A DeepSeek Harness plugin that lets you edit a message you already sent — change the text, remove images, drag to reorder them, add more — and resend it. Editing the first message of a session works too.

- Later messages: forks a new session after the previous turn and sends the edited message there.
- First message: opens a new session in the same workspace and sends it there.
- The original session stays untouched; the edit becomes a new chat next to it. The resent message shows "↩ Original" to jump back. Workspace files are not touched.
- Type `@` in the input box to reference a pending image by file name: it inserts an `@photo.png` tag that is sent as `[photo.png]` (`[Image 3 image.png]` when names repeat), and turns red (blocking the send) if that image is removed. An `@` typed right after non-ASCII text (e.g. Chinese without a space) opens a plugin menu that lists only images.
- Images in the conversation (yours, ones DeepSeek generates in replies, tool results) get Copy / Download on hover and in the full-size preview, and can be dragged into the input box as attachments.
- Pending attachments in the official input box can be dragged to reorder; they are sent in the new order.
- Copying a message with images copies the whole message: pasting into a DSH composer or the edit card restores the images as attachments in order; rich-text editors receive text and inline images.

Install:

```bash
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add dsh-resend-editor
```

Quit DSH (⌘Q) and reopen. If `dsh-recall-plugin` is installed, disable it (see the note above) to avoid two edit buttons.

## License

MIT
