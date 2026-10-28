# dsh-resend-editor

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件：编辑已发出的消息，然后重发。

发出去 10 张图加一大段文字，才发现图放错了、字写错了？不用重新复制文字、再一张张拖图：点消息下方的 ✎，原文和图片会原样出现在消息位置的编辑卡里，改完直接发。

[English](#english)

## 能做什么

- 改文字（预填原文）
- 删图片：缩略图右上角 ×
- 调整顺序：拖动缩略图，左下角序号就是发送顺序
- 补图片或文件：点 `+`、往卡片里拖，或在文字框里粘贴
- `⌘↵` 发送，`Esc` 取消
- 发送前按会话的图片限制校验（张数、单张大小、总大小、格式），超限直接提示
- 界面语言跟随 DSH 设置（中文 / English）

## 发送后会发生什么

| 编辑的是 | 做法 |
| --- | --- |
| 第二条及以后 | 从上一轮结束处 fork 出新会话（保留之前的对话），把改后的内容发出去 |
| 第一条 | 前面没有可切的轮次，在同一工作区开新会话发出去 |

原会话会被归档，可在侧栏归档里找回。只回退对话，不改动工作区文件。

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
- 依赖 DSH 尚未公开稳定的客户端接口，DSH 升级后可能需要更新插件。已验证版本：0.2.1-rc.3。

## 开发

`dev/` 下是隔离测试环境：本地假模型（OpenAI 兼容）+ 独立 `DSH_HOME` 的 web profile，不碰真实会话。

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
- The original session is archived (recoverable). Workspace files are not touched.

Install:

```bash
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add dsh-resend-editor
```

Quit DSH (⌘Q) and reopen. If `dsh-recall-plugin` is installed, disable it (see the note above) to avoid two edit buttons.

## License

MIT
