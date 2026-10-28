// dsh-resend-editor：给已发出的用户消息加「编辑」按钮。
// 编辑卡里可以改文字、删图片、拖动调整顺序、补图，发送后：
//   - 非第一条：从上一轮结束处 fork 出新会话，再把改后的内容发出去；
//   - 第一条：前面没有可切的轮次，直接在同一工作区开新会话发出去。
// 原会话默认归档（可在归档里找回），编辑后的消息上有「原对话」入口。消息气泡本身仍由官方组件渲染，本插件只包一层。
// 另外：复制带图片的消息、输入框附件拖动排序、@ 引用待发图片、对话里的图片可复制／下载／拖进输入框。
// 文档级监听都在 apply 里经 ctx.effect 注册，停用或热重载时撤掉。
window.__ModuleLoader__.load({
  id: 'dsh-resend-editor',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const PLUGIN = 'dsh-resend-editor'
    const NODE_SLOT = 'conversation.chat.node'
    const STRINGS = {
      zh: {
          edit: '编辑并重发',
          cancel: '取消',
          send: '发送',
          sending: '发送中…',
          add: '添加图片或文件',
          remove: '移除',
          dragHint: '拖动调整顺序',
          placeholder: '输入消息',
          footFork: '将从上一轮之后开新会话发送，原会话归档',
          footFirst: '第一条消息：将在同一工作区开新会话发送，原会话归档',
          keys: '⌘↵ 发送 · Esc 取消',
          errEmpty: '内容为空',
          errRead: '读取原附件失败：',
          errCut: '找不到上一轮的结束位置，请先向上滚动加载更早的消息再试',
          errFork: '新建会话失败：',
          errWorkspace: '找不到这条消息所在的工作区',
          errInput: '新会话的输入框没有就绪，内容未发出',
          errTooMany: '一条消息最多 {count} 张图片',
          errType: '只支持 PNG、JPG、WebP、GIF 图片：',
          errBig: '单张图片不能超过 {size}：',
          errTotal: '图片总大小不能超过 {size}',
          images: '图片',
          file: '文件',
          imgCopy: '复制图片',
          imgDownload: '下载图片',
          imgCopyShort: '复制',
          imgDownloadShort: '下载',
          imgFailed: '操作失败：',
          imgDrag: '拖到输入框可作为附件',
          tag: '图{n}',
          token: '【图{n}】',
          tokenGone: '【图?】',
          errRefGone: '有引用的图片已被移除，请删掉标红的引用后再发送',
          errTokenGone: '文字里有已删除图片的引用【图?】，请改掉后再发送',
          mentionHint: '@ 引用图片',
          origin: '原对话',
          originTitle: '打开编辑前的原对话（会从归档中恢复）'
        },
      en: {
          edit: 'Edit and resend',
          cancel: 'Cancel',
          send: 'Send',
          sending: 'Sending…',
          add: 'Add images or files',
          remove: 'Remove',
          dragHint: 'Drag to reorder',
          placeholder: 'Message',
          footFork: 'Sends in a new session forked after the previous turn; the original is archived',
          footFirst: 'First message: sends in a new session in the same workspace; the original is archived',
          keys: '⌘↵ send · Esc cancel',
          errEmpty: 'Nothing to send',
          errRead: 'Could not read the original attachment: ',
          errCut: 'Could not find where the previous turn ended; scroll up to load earlier messages and retry',
          errFork: 'Could not create the new session: ',
          errWorkspace: 'Could not find the workspace of this message',
          errInput: 'The new session input was not ready; nothing was sent',
          errTooMany: 'A message can include up to {count} images',
          errType: 'Only PNG, JPG, WebP and GIF images are supported: ',
          errBig: 'Each image must be under {size}: ',
          errTotal: 'Images must total under {size}',
          images: 'Images',
          file: 'File',
          imgCopy: 'Copy image',
          imgDownload: 'Download image',
          imgCopyShort: 'Copy',
          imgDownloadShort: 'Download',
          imgFailed: 'Failed: ',
          imgDrag: 'Drag into the input box to attach',
          tag: 'Image {n}',
          token: '[Image {n}]',
          tokenGone: '[Image ?]',
          errRefGone: 'A referenced image was removed; delete the red reference before sending',
          errTokenGone: 'The text references a removed image ([Image ?]); fix it before sending',
          mentionHint: '@ reference an image',
          origin: 'Original',
          originTitle: 'Open the conversation before this edit (restores it from the archive)'
        }
    }
    // 跟随 DSH 自己的界面语言：桌面版以 --lang=en-US 启动，navigator.language 不可信
    let T = STRINGS.zh
    function syncLocale(ctx) {
      try {
        const localeSvc = ctx.get('locale')
        // getLocale() 返回快照 { active, locales, revision }，active 形如 'zh' / 'en'
        const snap = localeSvc && localeSvc.getLocale()
        const current = snap && typeof snap === 'object' ? snap.active : snap
        if (typeof current === 'string' && current) T = /^zh/i.test(current) ? STRINGS.zh : STRINGS.en
      } catch (e) {}
    }

    const log = {
      warn: (...a) => console.warn('[' + PLUGIN + ']', ...a),
      info: (...a) => console.info('[' + PLUGIN + ']', ...a)
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

    const CSS = `
.der-card{width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:12px 14px 10px;border-radius:var(--dsw-radius-panel,20px);background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-2));box-shadow:var(--dsw-elevation-soft,0 4px 16px rgba(0,0,0,.18));border:1px solid transparent}
.der-card[data-drop="true"]{border-color:var(--dsw-alias-brand-primary)}
.der-text{width:100%;box-sizing:border-box;min-height:48px;max-height:360px;padding:2px;border:0;outline:none;resize:none;overflow-y:auto;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--dsh-content-font-size,14px);line-height:1.7}
.der-grid{display:flex;flex-wrap:wrap;gap:8px}
.der-tile{position:relative;width:72px;height:72px;border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-3);cursor:grab;flex:none;user-select:none;outline:1px solid var(--dsw-alias-border-l1)}
.der-tile[data-dragging="true"]{opacity:.35}
.der-tile[data-over="true"]{outline:2px solid var(--dsw-alias-brand-primary)}
.der-tile img{display:block;width:100%;height:100%;object-fit:cover;pointer-events:none}
.der-tile-file{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:6px;box-sizing:border-box;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.3;text-align:center;word-break:break-all}
.der-tile-ext{font-weight:600;font-size:12px;color:var(--dsw-alias-label-primary)}
.der-index{position:absolute;left:4px;bottom:4px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;line-height:16px;text-align:center}
.der-x{position:absolute;top:3px;right:3px;width:20px;height:20px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;background:rgba(0,0,0,.6);color:#fff;font-size:13px;line-height:1;cursor:pointer}
.der-x:hover{background:var(--dsw-alias-state-error-primary,#e5484d)}
.der-addtile{width:72px;height:72px;flex:none;border-radius:10px;border:1px dashed var(--dsw-alias-border-l4,rgba(127,127,127,.5));background:transparent;color:var(--dsw-alias-label-tertiary);font-size:24px;cursor:pointer}
.der-addtile:hover{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}
.der-foot{display:flex;align-items:center;gap:8px;min-height:32px}
.der-note{flex:1;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
.der-error{color:var(--dsw-alias-state-error-primary,#e5484d);font-size:12px;line-height:1.5}
.der-btn{height:30px;padding:0 14px;border-radius:15px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer;white-space:nowrap}
.der-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.der-btn-primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground,#fff)}
.der-btn-primary:hover{filter:brightness(1.08);background:var(--dsw-alias-brand-primary)}
.der-btn[disabled]{opacity:.5;cursor:default}
.der-file-input{display:none}
[data-der-reorder]>[draggable="true"]{cursor:grab}
[data-der-reorder]>.der-rail-dragging{opacity:.35}
[data-der-reorder]>.der-rail-over{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:12px}
.der-railnum{position:absolute;left:4px;bottom:4px;z-index:1;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;line-height:16px;text-align:center;pointer-events:none}
.der-imgbar{position:fixed;z-index:2147483000;display:flex;gap:4px;padding:3px;border-radius:9px;background:rgba(20,20,22,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 2px 8px rgba(0,0,0,.25)}
.der-imgbar[hidden]{display:none}
.der-imgbar button{width:26px;height:26px;padding:0;border:0;border-radius:6px;display:grid;place-items:center;background:transparent;color:#fff;cursor:pointer}
.der-imgbar button:hover{background:rgba(255,255,255,.16)}
.der-imgbar button[data-state="ok"]{color:#3fd18a}
.der-imgbar button[data-state="fail"]{color:#ff6b6b}
.der-lbbar{position:fixed;top:14px;right:64px;z-index:2147483000;display:flex;gap:8px}
.der-lbbar button{height:32px;padding:0 12px;border:0;border-radius:16px;display:flex;align-items:center;gap:6px;background:rgba(20,20,22,.72);color:#fff;font-size:13px;cursor:pointer}
.der-lbbar button:hover{background:rgba(60,60,64,.85)}
.der-lbbar button[data-state="ok"]{color:#3fd18a}
.der-lbbar button[data-state="fail"]{color:#ff6b6b}
[data-der-imgdrag]{cursor:grab}
[data-composer-card][data-der-dropping]{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.der-mention{display:flex;flex-wrap:wrap;gap:6px;padding:6px;border-radius:12px;background:var(--dsw-alias-bg-layer-3,rgba(127,127,127,.12))}
.der-mention button{display:flex;align-items:center;gap:6px;height:32px;padding:0 10px 0 4px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer}
.der-mention button[data-active="true"],.der-mention button:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l1)}
.der-mention img{width:24px;height:24px;border-radius:5px;object-fit:cover}
.der-menuthumb{width:20px;height:20px;border-radius:4px;object-fit:cover;display:block}
.der-atpop{position:fixed;z-index:2147483000;min-width:200px;max-width:320px;max-height:280px;overflow-y:auto;box-sizing:border-box;padding:6px;border-radius:12px;background:var(--dsw-specific-input-major,#2b2b2f);border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.25));box-shadow:0 8px 24px rgba(0,0,0,.28);display:flex;flex-direction:column;gap:2px}
.der-atpop[hidden]{display:none}
.der-atpop-title{padding:4px 8px 2px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.der-atpop button{display:flex;align-items:center;gap:8px;height:34px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;text-align:left;cursor:pointer}
.der-atpop button[data-active="true"],.der-atpop button:hover{background:var(--dsw-alias-interactive-bg-hover)}
.der-atpop img{width:24px;height:24px;border-radius:5px;object-fit:cover;flex:none}
.der-atpop small{margin-left:auto;padding-left:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px}
.der-origin{display:inline-flex;align-items:center;gap:3px;width:auto!important;padding:0 6px!important;font-size:12px;white-space:nowrap}
`

    function injectCss() {
      if (typeof document === 'undefined' || document.querySelector('style[data-plugin="' + PLUGIN + '"]')) return
      const tag = document.createElement('style')
      tag.setAttribute('data-plugin', PLUGIN)
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // ---------- 消息内容与附件 ----------

    function splitContent(blocks) {
      const texts = []
      const items = []
      for (const b of Array.isArray(blocks) ? blocks : []) {
        if (!b) continue
        if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text)
        else if ((b.type === 'image' || b.type === 'file') && b.attachment && b.attachment.attachmentId) {
          items.push({
            key: 'orig:' + b.attachment.attachmentId + ':' + items.length,
            kind: b.type,
            attachment: b.attachment,
            name: b.attachment.name || (b.type === 'image' ? 'image' : T.file)
          })
        }
      }
      return { text: texts.join(''), items }
    }

    function extOf(name) {
      const dot = name.lastIndexOf('.')
      return dot > 0 ? name.slice(dot + 1).slice(0, 4).toUpperCase() : 'FILE'
    }

    async function itemToFile(ctx, sessionId, item) {
      if (item.file) return item.file
      const binding = ctx.sessions.binding(sessionId)
      const session = binding && binding.session
      if (!session || typeof session.readAttachment !== 'function') throw new Error('readAttachment unavailable')
      const res = await session.readAttachment(item.attachment.attachmentId)
      if (!res || res.ok !== true || !res.value || res.value.data == null) throw new Error(item.name)
      const raw = res.value.data
      const bytes = raw instanceof Uint8Array ? raw : Uint8Array.from(raw)
      const meta = res.value.attachment || item.attachment
      const type = (meta && meta.mediaType) || 'application/octet-stream'
      return new File([bytes], item.name, { type })
    }

    // ---------- 切点：上一轮结束的 seq ----------

    function chatSnapshot(ctx, sessionId) {
      const binding = ctx.sessions.binding(sessionId)
      if (!binding) return null
      return ctx.uiConversation.binding(binding).target('chat').getSnapshot()
    }

    // 返回 { kind: 'fork', atSeq } | { kind: 'first' } | { kind: 'unknown' }
    function resolveCut(ctx, sessionId, messageSeq) {
      const snap = chatSnapshot(ctx, sessionId)
      const turns = snap && snap.timeline && snap.timeline.turns ? [...snap.timeline.turns.values()] : []
      let prevEnd = null
      let earliest = null
      for (const turn of turns) {
        if (!turn) continue
        if (turn.end && typeof turn.end.seq === 'number' && turn.end.seq < messageSeq) {
          if (prevEnd === null || turn.end.seq > prevEnd) prevEnd = turn.end.seq
        }
        if (typeof turn.turn === 'number' && (earliest === null || turn.turn < earliest.turn)) earliest = turn
      }
      if (prevEnd !== null) return { kind: 'fork', atSeq: prevEnd }
      // 用户消息记在它所属轮次的 turn/start 之后；前面没有结束的轮次，且已加载的最早一轮就是第 1 轮 → 会话第一条
      if (!earliest || earliest.turn === 1) return { kind: 'first' }
      return { kind: 'unknown' }
    }

    async function resolveCutLoading(ctx, sessionId, messageSeq) {
      let cut = resolveCut(ctx, sessionId, messageSeq)
      for (let i = 0; cut.kind === 'unknown' && i < 6; i++) {
        const binding = ctx.sessions.binding(sessionId)
        try {
          binding && binding.session && binding.session.loadOlder()
        } catch (e) {}
        await sleep(400)
        cut = resolveCut(ctx, sessionId, messageSeq)
      }
      return cut
    }

    // 宿主在提交后才按 imageLimits 校验，而输入框会先乐观清空——超限要在编辑卡里提前拦下
    function imageLimitsOf(ctx, sessionId) {
      try {
        const row = ctx.sessions.list.getSnapshot().byId[sessionId]
        return (row && row.projectionValues && row.projectionValues.imageLimits) || null
      } catch (e) {
        return null
      }
    }

    function sizeText(bytes) {
      return bytes >= 1048576 ? Math.round(bytes / 1048576) + 'MB' : Math.round(bytes / 1024) + 'KB'
    }

    function validateItems(items, limits) {
      if (!limits) return ''
      const images = items.filter((it) => it.kind === 'image')
      if (images.length > limits.maxImagesPerMessage) return T.errTooMany.replace('{count}', limits.maxImagesPerMessage)
      let total = 0
      for (const it of images) {
        const type = it.file ? it.file.type : it.attachment && it.attachment.mediaType
        const bytes = it.file ? it.file.size : (it.attachment && it.attachment.bytes) || 0
        if (Array.isArray(limits.mediaTypes) && type && !limits.mediaTypes.includes(type)) return T.errType + it.name
        if (bytes > limits.maxImageBytes) return T.errBig.replace('{size}', sizeText(limits.maxImageBytes)) + it.name
        total += bytes
      }
      if (limits.maxMessageImageBytes && total > limits.maxMessageImageBytes) return T.errTotal.replace('{size}', sizeText(limits.maxMessageImageBytes))
      return ''
    }

    function workspaceOf(ctx, sessionId) {
      const snap = ctx.workspaces && ctx.workspaces.list && ctx.workspaces.list.getSnapshot()
      const item = snap && Array.isArray(snap.items) ? snap.items.find((it) => Array.isArray(it.sessionIds) && it.sessionIds.includes(sessionId)) : null
      return item ? item.workspaceId : null
    }

    // ---------- 把内容写进目标会话的输入框并发送 ----------

    async function waitShell(ctx, sessionId) {
      for (let i = 0; i < 40; i++) {
        try {
          const conversation = ctx.get('conversation')
          const shell = conversation && conversation.input && conversation.input.shell(sessionId)
          if (shell && shell.actions && typeof shell.actions.setDraft === 'function') return { conversation, shell }
        } catch (e) {}
        await sleep(100)
      }
      return null
    }

    async function fillAndSubmit(ctx, sessionId, text, files) {
      const got = await waitShell(ctx, sessionId)
      if (!got) throw new Error(T.errInput)
      const { conversation, shell } = got
      const actions = shell.actions
      // 复用的空白会话可能残留旧草稿附件，先清掉
      const leftover = shell.snapshot && Array.isArray(shell.snapshot.attachmentIds) ? shell.snapshot.attachmentIds.slice() : []
      for (const id of leftover) {
        try {
          actions.removeAttachment(id)
          conversation.releaseDraftAttachment && conversation.releaseDraftAttachment(id)
        } catch (e) {}
      }
      actions.setDraft(text)
      if (files.length) {
        const drafts = conversation.createDrafts(sessionId, files)
        const ids = drafts.map((d) => d && d.id).filter(Boolean)
        if (actions.addAttachments(ids) === false) {
          conversation.releaseDraftAttachments && conversation.releaseDraftAttachments(drafts)
          throw new Error(T.errInput)
        }
      }
      const draftText = () => {
        const draft = shell.snapshot && shell.snapshot.draft
        return typeof draft === 'string' ? draft : draft && typeof draft.text === 'string' ? draft.text : null
      }
      for (let i = 0; i < 20; i++) {
        const current = draftText()
        if (current === null || current === text) break
        await sleep(50)
      }
      actions.submit()
      // 发送被接受时输入框会清空；超过上限的图片等会被官方拒绝，内容留在输入框里
      for (let i = 0; i < 40; i++) {
        const ids = shell.snapshot && shell.snapshot.attachmentIds
        if (draftText() === '' && (!ids || ids.length === 0)) return true
        await sleep(100)
      }
      return false
    }

    async function editAndResend(ctx, { sessionId, messageSeq, text, items }) {
      const files = []
      for (const item of items) {
        try {
          files.push(await itemToFile(ctx, sessionId, item))
        } catch (e) {
          throw new Error(T.errRead + (e && e.message ? e.message : String(e)))
        }
      }
      const cut = await resolveCutLoading(ctx, sessionId, messageSeq)
      let targetId = null
      if (cut.kind === 'fork') {
        try {
          targetId = await ctx.sessions.fork({ sessionId, atSeq: cut.atSeq, increaseTitle: true })
        } catch (e) {
          throw new Error(T.errFork + (e && e.message ? e.message : String(e)))
        }
        if (!targetId) throw new Error(T.errFork)
        ctx.uiWorkspace.openSession(targetId)
      } else if (cut.kind === 'first') {
        const workspaceId = workspaceOf(ctx, sessionId)
        if (!workspaceId) throw new Error(T.errWorkspace)
        try {
          await ctx.uiWorkspace.openWorkspace(workspaceId, (id) => {
            targetId = id
          })
        } catch (e) {
          throw new Error(T.errFork + (e && e.message ? e.message : String(e)))
        }
        if (!targetId || targetId === sessionId) throw new Error(T.errFork)
      } else {
        throw new Error(T.errCut)
      }
      rememberOrigin(targetId, sessionId, cut.kind === 'fork' ? cut.atSeq : -1)
      const sent = await fillAndSubmit(ctx, targetId, text, files)
      if (!sent) {
        // 没发出去就不动原会话：内容已在新会话输入框里，按官方提示处理后手动发送即可
        log.warn('submission not admitted; original session kept')
        return targetId
      }
      try {
        await ctx.workspaces.archiveSession(sessionId, { stopActivity: true })
      } catch (e) {
        log.warn('archive original failed', e)
      }
      return targetId
    }

    // ---------- 编辑后的新会话 → 原对话 ----------
    // 编辑重发不会删历史：原会话整体归档。在编辑后发出的那条消息上留一个「原对话」入口。
    // 记录只放在本机（localStorage），fork 与「第一条开新会话」两种情况都适用。
    const ORIGINS_KEY = PLUGIN + ':origins'
    let originsCache = null
    function readOrigins() {
      if (originsCache) return originsCache
      try {
        originsCache = JSON.parse(localStorage.getItem(ORIGINS_KEY) || '{}') || {}
      } catch (e) {
        originsCache = {}
      }
      return originsCache
    }

    function rememberOrigin(targetId, from, after) {
      const all = { ...readOrigins(), [targetId]: { from, after, at: Date.now() } }
      const keys = Object.keys(all)
      if (keys.length > 300) {
        keys.sort((a, b) => all[a].at - all[b].at)
        for (const k of keys.slice(0, keys.length - 300)) delete all[k]
      }
      originsCache = all
      try {
        localStorage.setItem(ORIGINS_KEY, JSON.stringify(all))
      } catch (e) {}
    }

    // 新会话里切点之后的第一条用户消息，就是编辑后发出的那条
    function originFor(ctx, sessionId, seq) {
      const rec = readOrigins()[sessionId]
      if (!rec || typeof seq !== 'number' || seq <= rec.after) return null
      const snap = chatSnapshot(ctx, sessionId)
      const byKey = snap && snap.nodes && snap.nodes.byKey
      if (!byKey) return null
      let first = Infinity
      for (const node of typeof byKey.values === 'function' ? byKey.values() : Object.values(byKey)) {
        const s = node && node.kind === 'user' && node.data ? node.data.seq : undefined
        if (typeof s === 'number' && s > rec.after && s < first) first = s
      }
      return first === seq ? rec : null
    }

    // 归档的会话不能直接打开（官方会提示不可打开），先从归档里恢复
    async function openOrigin(ctx, from) {
      try {
        const snap = ctx.workspaces.list.getSnapshot()
        const archived = snap && snap.archivedSessionIds
        const isArchived = archived && (typeof archived.has === 'function' ? archived.has(from) : Array.prototype.includes.call(archived, from))
        if (isArchived) await ctx.uiWorkspace.unarchiveSession(from)
        ctx.uiWorkspace.openSession(from)
      } catch (e) {
        log.warn('open original session failed', e)
      }
    }

    // ---------- 复制带图片 ----------
    // 剪贴板一次只能放一张图片数据，所以分两层：
    //   - text/plain + text/html（图片内嵌为 data URI）→ 飞书、备忘录等富文本编辑器能贴出图文；
    //   - 内存里记下这次复制的原始文件 → 粘贴到 DSH 输入框或编辑卡时按原顺序还原成附件。
    const COPY_ATTR = 'data-der-copy'
    let lastCopy = null

    function escapeHtml(s) {
      return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
    }

    function fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
    }

    // 只处理带附件的消息；纯文字消息交给官方复制
    async function copyWithAttachments(ctx, sessionId, node) {
      const { text, items } = splitContent(node && node.data && node.data.content)
      if (!items.length) return false
      const files = []
      for (const item of items) files.push(await itemToFile(ctx, sessionId, item))
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      const parts = []
      for (const file of files) {
        if (/^image\//.test(file.type)) parts.push('<p><img src="' + (await fileToDataUrl(file)) + '" alt="' + escapeHtml(file.name) + '"></p>')
        else parts.push('<p>[' + escapeHtml(file.name) + ']</p>')
      }
      if (text) parts.push('<p>' + escapeHtml(text).replace(/\n/g, '<br>') + '</p>')
      const html = '<div ' + COPY_ATTR + '="' + id + '">' + parts.join('') + '</div>'
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' })
        })
      ])
      lastCopy = { id, text, files }
      return true
    }

    // 剪贴板里是不是本插件刚复制的那条消息；是就返回它的原始附件
    function copiedFilesFor(clipboardData) {
      if (!lastCopy || !clipboardData) return null
      if (clipboardData.files && clipboardData.files.length) return null
      const html = clipboardData.getData('text/html') || ''
      const plain = clipboardData.getData('text/plain') || ''
      const same = html.includes(COPY_ATTR + '="' + lastCopy.id + '"') || (lastCopy.text !== '' && plain === lastCopy.text)
      return same ? lastCopy.files : null
    }

    function addDraftFiles(ctx, sessionId, files) {
      try {
        const conversation = ctx.get('conversation')
        const shell = conversation && conversation.input && conversation.input.shell(sessionId)
        if (!shell || !shell.actions) return
        const drafts = conversation.createDrafts(sessionId, files)
        if (shell.actions.addAttachments(drafts.map((d) => d.id)) === false && conversation.releaseDraftAttachments) {
          conversation.releaseDraftAttachments(drafts)
        }
      } catch (e) {
        log.warn('restore pasted attachments failed', e)
      }
    }

    // 官方输入框：文字照常由官方粘贴，图片在下一轮事件循环按原顺序补成附件
    // apply 可能被调用多次、插件也可能热重载：全局只保留一个监听，否则图片会被重复添加
    function installPasteRestore(ctx) {
      const handler = (e) => {
        const target = e.target
        if (!target || !target.closest || target.closest('.der-card') || !target.closest('[data-composer-card]')) return
        const files = copiedFilesFor(e.clipboardData)
        const ref = ctx.uiWorkspace.mainReference
        if (!files || !files.length || !ref || !ref.sessionId) return
        const sessionId = ref.sessionId
        setTimeout(() => addDraftFiles(ctx, sessionId, files), 0)
      }
      const key = '__' + PLUGIN + ':paste'
      if (window[key]) document.removeEventListener('paste', window[key], true)
      window[key] = handler
      document.addEventListener('paste', handler, true)
      return () => {
        document.removeEventListener('paste', handler, true)
        if (window[key] === handler) window[key] = null
      }
    }

    // ---------- 官方输入框附件拖动排序 ----------
    // 官方附件栏按 shell.attachmentIds 的顺序渲染、发送；shell 没有重排接口，
    // 用「全部移除（不释放）再按新顺序加回」实现，草稿附件本身不受影响。
    const RAIL_SELECTOR = '[data-composer-card] [data-slot="conversation.input.attachments"] [role="group"]'

    function reorderComposer(ctx, fromIndex, toIndex, railCount) {
      const ref = ctx.uiWorkspace.mainReference
      if (!ref || !ref.sessionId || fromIndex === toIndex) return
      const shell = ctx.get('conversation').input.shell(ref.sessionId)
      const ids = shell && shell.snapshot && Array.isArray(shell.snapshot.attachmentIds) ? shell.snapshot.attachmentIds.slice() : []
      // 条目数对不上说明这条附件栏不属于主会话的输入框（例如侧栏里的另一个输入框），不动
      if (ids.length !== railCount) return
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= ids.length || toIndex >= ids.length) return
      const next = ids.slice()
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      for (const id of ids) shell.actions.removeAttachment(id)
      if (shell.actions.addAttachments(next) === false) shell.actions.addAttachments(ids)
    }

    function bindRail(ctx, rail) {
      if (rail.hasAttribute('data-der-reorder')) return
      rail.setAttribute('data-der-reorder', 'true')
      let from = -1
      const itemOf = (target) => {
        let el = target
        while (el && el.parentElement !== rail) el = el.parentElement
        return el && el.parentElement === rail ? el : null
      }
      const indexOf = (el) => Array.prototype.indexOf.call(rail.children, el)
      const clearOver = () => rail.querySelectorAll('.der-rail-over').forEach((el) => el.classList.remove('der-rail-over'))
      const end = () => {
        from = -1
        clearOver()
        rail.querySelectorAll('.der-rail-dragging').forEach((el) => el.classList.remove('der-rail-dragging'))
      }
      rail.addEventListener('dragstart', (e) => {
        const item = itemOf(e.target)
        if (!item) return
        from = indexOf(item)
        item.classList.add('der-rail-dragging')
        e.dataTransfer.effectAllowed = 'move'
        try {
          e.dataTransfer.setData('application/x-der-reorder', String(from))
        } catch (err) {}
        e.stopPropagation()
      })
      // 内部拖动的事件不能冒泡到官方输入框：它会当成「拖入文件」处理
      rail.addEventListener('dragenter', (e) => {
        if (from < 0) return
        e.preventDefault()
        e.stopPropagation()
      })
      rail.addEventListener('dragover', (e) => {
        if (from < 0) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        const item = itemOf(e.target)
        clearOver()
        if (item && indexOf(item) !== from) item.classList.add('der-rail-over')
      })
      rail.addEventListener('drop', (e) => {
        if (from < 0) return
        e.preventDefault()
        e.stopPropagation()
        const item = itemOf(e.target)
        const to = item ? indexOf(item) : -1
        const start = from
        end()
        if (to >= 0) reorderComposer(ctx, start, to, rail.children.length)
      })
      rail.addEventListener('dragend', end)
    }

    function prepareRails(ctx) {
      for (const rail of document.querySelectorAll(RAIL_SELECTOR)) {
        bindRail(ctx, rail)
        // 图片左下角标上序号，和 @ 引用里的「图N」对应（只数图片，文件不占号）
        let n = 0
        for (const item of rail.children) {
          if (item.getAttribute('draggable') !== 'true') item.setAttribute('draggable', 'true')
          // 缩略图里的 img 默认可拖（会拖出图片地址），交给外层条目处理
          for (const img of item.querySelectorAll('img')) if (img.draggable) img.draggable = false
          let badge = item.querySelector(':scope > .der-railnum')
          if (item.querySelector('img')) {
            n++
            if (!badge) {
              badge = document.createElement('span')
              badge.className = 'der-railnum'
              if (getComputedStyle(item).position === 'static') item.style.position = 'relative'
              item.appendChild(badge)
            }
            if (badge.textContent !== String(n)) badge.textContent = String(n)
          } else if (badge) badge.remove()
        }
      }
    }

    function installComposerReorder(ctx) {
      const key = '__' + PLUGIN + ':reorder'
      if (window[key]) window[key].disconnect()
      let queued = false
      // 插件卸载（含热重载）后，已经排进 rAF 的这一轮不能再用失效的 ctx
      let alive = true
      const pass = () => {
        prepareLightboxes()
        let ref = null
        try {
          ref = ctx.uiWorkspace.mainReference
        } catch (e) {
          // 热重载时旧 ctx 可能先于 effect 清理失效：这一份观察器自行停掉
          alive = false
          obs.disconnect()
          return
        }
        prepareRails(ctx)
        if (ref && ref.sessionId) trackDraft(ctx, ref.sessionId)
      }
      const obs = new MutationObserver(() => {
        if (queued) return
        queued = true
        requestAnimationFrame(() => {
          queued = false
          if (alive) pass()
        })
      })
      obs.observe(document.body, { childList: true, subtree: true })
      window[key] = obs
      pass()
      return () => {
        alive = false
        obs.disconnect()
        if (window[key] === obs) window[key] = null
      }
    }

    // ---------- 图片：复制、下载、拖进输入框 ----------
    // 官方灯箱没有下载，消息里的图片也不能复制。对话区里的图片（用户消息、工具结果、
    // 回复里的 Markdown 图片）都是「按钮里包一张 img」：悬停时浮出一条小工具栏，灯箱打开时右上角补两个按钮。
    const IMAGE_MIME = 'application/x-der-image'
    const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' }
    const ICON_COPY =
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="1.8" stroke="currentColor" stroke-width="1.2"/><path d="M10.5 3.2V3A1.5 1.5 0 0 0 9 1.5H3.5A1.5 1.5 0 0 0 2 3v5.5A1.5 1.5 0 0 0 3.5 10h.3" stroke="currentColor" stroke-width="1.2"/></svg>'
    const ICON_DOWNLOAD =
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2v8.5M4.5 7 8 10.5 11.5 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.5 11v1.5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>'
    const ICON_OK =
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8.5 3.2 3L13 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    let draggedImage = null

    function imageFrameOf(target) {
      const frame = target && target.closest ? target.closest('button') : null
      if (!frame || !frame.closest('[data-conversation-content]')) return null
      if (frame.closest('[data-composer-card]') || frame.closest('.der-card')) return null
      if (frame.getElementsByTagName('img').length !== 1 || frame.textContent.trim() !== '') return null
      // 排除图标一类的小图
      const r = frame.getBoundingClientRect()
      if (r.width < 40 || r.height < 40) return null
      return frame
    }

    function imageNameFor(img, type) {
      const alt = (img.getAttribute('alt') || '').trim()
      if (/\.[a-z0-9]{2,5}$/i.test(alt)) return alt
      // 回复里的 Markdown 图片走 api/file?path=…，用原文件名
      try {
        const path = new URL(img.currentSrc || img.src, document.baseURI).searchParams.get('path')
        const base = path && path.split(/[\\/]/).pop()
        if (base) return base
      } catch (e) {}
      return (alt || 'image').replace(/[\\/:*?"<>|]/g, '_') + '.' + (MIME_EXT[type] || 'png')
    }

    async function imageFile(img) {
      const res = await fetch(img.currentSrc || img.src)
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const blob = await res.blob()
      const type = blob.type || 'image/png'
      return new File([blob], imageNameFor(img, type), { type })
    }

    // 剪贴板里的图片只认 PNG，其他格式先画到 canvas 转一次
    async function toPng(blob) {
      if (blob.type === 'image/png') return blob
      const bitmap = await createImageBitmap(blob)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d').drawImage(bitmap, 0, 0)
      return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'))
    }

    // ClipboardItem 直接收 Promise：写入在点击当下发起，读图片的耗时不会让剪贴板权限过期
    function copyImage(img) {
      return navigator.clipboard.write([new ClipboardItem({ 'image/png': imageFile(img).then(toPng) })])
    }

    async function downloadImage(img) {
      const file = await imageFile(img)
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    }

    function runImageAction(button, img, run) {
      if (!img || button.hasAttribute('data-state')) return
      const html = button.innerHTML
      const title = button.title
      Promise.resolve()
        .then(() => run(img))
        .then(
          () => {
            button.setAttribute('data-state', 'ok')
            button.innerHTML = html.replace(/<svg[\s\S]*?<\/svg>/, ICON_OK)
          },
          (e) => {
            button.setAttribute('data-state', 'fail')
            button.title = T.imgFailed + (e && e.message ? e.message : String(e))
            log.warn('image action failed', e)
          }
        )
        .then(() =>
          setTimeout(() => {
            button.removeAttribute('data-state')
            button.innerHTML = html
            button.title = title
          }, 1400)
        )
    }

    function addImageButtons(container, getImg, withLabels) {
      const specs = [
        { icon: ICON_COPY, title: T.imgCopy, label: T.imgCopyShort, run: copyImage },
        { icon: ICON_DOWNLOAD, title: T.imgDownload, label: T.imgDownloadShort, run: downloadImage }
      ]
      for (const spec of specs) {
        const button = document.createElement('button')
        button.type = 'button'
        button.title = spec.title
        button.setAttribute('aria-label', spec.title)
        button.innerHTML = spec.icon + (withLabels ? '<span>' + escapeHtml(spec.label) + '</span>' : '')
        button.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          runImageAction(button, getImg(), spec.run)
        })
        container.appendChild(button)
      }
    }

    // 灯箱：只有一张图、没有输入控件的模态框
    function prepareLightboxes() {
      for (const dialog of document.querySelectorAll('[role="dialog"][aria-modal="true"]')) {
        if (dialog.querySelector(':scope .der-lbbar')) continue
        if (dialog.getElementsByTagName('img').length !== 1 || dialog.querySelector('input,textarea,select,[contenteditable]')) continue
        const bar = document.createElement('div')
        bar.className = 'der-lbbar'
        // 点按钮不能让事件落到遮罩上，否则灯箱会被当成「点遮罩」关掉
        for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) bar.addEventListener(type, (e) => e.stopPropagation())
        addImageButtons(bar, () => dialog.querySelector('img'), true)
        dialog.appendChild(bar)
      }
    }

    function installImageActions(ctx) {
      const key = '__' + PLUGIN + ':images'
      if (window[key]) window[key]()
      const bar = document.createElement('div')
      bar.className = 'der-imgbar'
      bar.hidden = true
      let frame = null
      let hideTimer = 0
      addImageButtons(bar, () => (frame ? frame.querySelector('img') : null), false)
      document.body.appendChild(bar)

      const hideNow = () => {
        clearTimeout(hideTimer)
        bar.hidden = true
        frame = null
      }
      const hideSoon = () => {
        clearTimeout(hideTimer)
        hideTimer = setTimeout(hideNow, 160)
      }
      const show = (next) => {
        clearTimeout(hideTimer)
        frame = next
        bar.hidden = false
        const r = next.getBoundingClientRect()
        // 大图放在图内右上角；小缩略图（多图消息、工具结果）放不下，挪到图的上方
        const inside = r.width >= 96 && r.height >= 56
        bar.style.left = Math.max(4, r.right - bar.offsetWidth - (inside ? 6 : 0)) + 'px'
        bar.style.top = Math.max(4, inside ? r.top + 6 : r.top - bar.offsetHeight - 4) + 'px'
      }
      const onOver = (e) => {
        if (bar.contains(e.target)) {
          clearTimeout(hideTimer)
          return
        }
        const next = imageFrameOf(e.target)
        if (next) {
          if (!next.hasAttribute('data-der-imgdrag')) {
            next.setAttribute('data-der-imgdrag', 'true')
            next.draggable = true
            const img = next.querySelector('img')
            if (img) img.draggable = false
          }
          show(next)
        } else if (frame) hideSoon()
      }
      const onOut = (e) => {
        if (!e.relatedTarget && frame) hideSoon()
      }

      // 拖到输入框：只认本插件发起的拖动；落在编辑卡上的由编辑卡自己处理
      const composerOf = (e) => {
        const t = e.target
        if (!t || !t.closest || t.closest('.der-card')) return null
        return t.closest('[data-composer-card]')
      }
      const ours = (e) => draggedImage && e.dataTransfer && Array.from(e.dataTransfer.types || []).includes(IMAGE_MIME)
      const clearDrop = () => document.querySelectorAll('[data-der-dropping]').forEach((el) => el.removeAttribute('data-der-dropping'))
      const onDragStart = (e) => {
        const source = e.target && e.target.closest ? e.target.closest('[data-der-imgdrag]') : null
        if (!source || !imageFrameOf(source)) return
        draggedImage = source.querySelector('img')
        e.dataTransfer.effectAllowed = 'copy'
        try {
          e.dataTransfer.setData(IMAGE_MIME, '1')
        } catch (err) {}
        hideNow()
      }
      const onDragOver = (e) => {
        if (!ours(e)) return
        const card = composerOf(e)
        if (!card) {
          if (!(e.target && e.target.closest && e.target.closest('.der-card'))) clearDrop()
          return
        }
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'copy'
        if (!card.hasAttribute('data-der-dropping')) {
          clearDrop()
          card.setAttribute('data-der-dropping', 'true')
        }
      }
      const onDrop = (e) => {
        if (!ours(e)) return
        const card = composerOf(e)
        clearDrop()
        if (!card) return
        e.preventDefault()
        e.stopPropagation()
        const img = draggedImage
        const ref = ctx.uiWorkspace.mainReference
        if (!ref || !ref.sessionId) return
        const sessionId = ref.sessionId
        imageFile(img).then(
          (file) => addDraftFiles(ctx, sessionId, [file]),
          (err) => log.warn('drop image failed', err)
        )
      }
      const onDragEnd = () => {
        clearDrop()
        setTimeout(() => {
          draggedImage = null
        }, 0)
      }

      const listeners = [
        [document, 'pointerover', onOver, true],
        [document, 'pointerout', onOut, true],
        [window, 'scroll', hideNow, true],
        [window, 'blur', hideNow, false],
        [document, 'dragstart', onDragStart, true],
        [document, 'dragenter', onDragOver, true],
        [document, 'dragover', onDragOver, true],
        [document, 'drop', onDrop, true],
        [document, 'dragend', onDragEnd, true]
      ]
      for (const [target, type, fn, capture] of listeners) target.addEventListener(type, fn, capture)
      const cleanup = () => {
        for (const [target, type, fn, capture] of listeners) target.removeEventListener(type, fn, capture)
        clearTimeout(hideTimer)
        bar.remove()
        if (window[key] === cleanup) window[key] = null
      }
      window[key] = cleanup
      return cleanup
    }

    // ---------- @ 引用图片 ----------
    // 在官方 @ 菜单里加一组「图片」：选中后插入引用 chip（显示为 @图N），发送时按当时的附件顺序写成【图N】。
    // 调整顺序或删图后草稿里的 chip 跟着重编号，引用的图被删掉就标红，发送时拦下。
    const MENTION_SOURCE = 'der-image'
    const fmt = (s, n) => s.replace('{n}', n)

    function draftImages(ctx, sessionId) {
      const conversation = ctx.get('conversation')
      const shell = conversation && conversation.input && conversation.input.shell(sessionId)
      const ids = shell && shell.state ? shell.state.getSnapshot().attachmentIds || [] : []
      const out = []
      for (const id of ids) {
        const draft = conversation.draftAttachments && conversation.draftAttachments.get(id)
        if (draft && draft.kind === 'image') out.push({ id, n: out.length + 1, name: (draft.file && draft.file.name) || '', url: draft.previewUrl || '' })
      }
      return out
    }

    function mentionRef(sessionId, id) {
      return MENTION_SOURCE + ':' + sessionId + ':' + id
    }

    // 引用当前对应第几张图；图已不在输入框里时返回 0
    function mentionNumber(ctx, ref) {
      const m = /^der-image:([^:]+):(.+)$/.exec(ref || '')
      if (!m) return 0
      try {
        const hit = draftImages(ctx, m[1]).find((im) => im.id === m[2])
        return hit ? hit.n : 0
      } catch (e) {
        return 0
      }
    }

    function thumbIcon(url) {
      return function DerMentionThumb() {
        return url ? h('img', { className: 'der-menuthumb', src: url, alt: '' }) : null
      }
    }

    // 附件顺序变了（拖动排序、删图、加图）就重写草稿里的图片 chip：编号、复制文本、是否标红
    function relabelDraft(ctx, shell) {
      const doc = shell.draftSnapshot
      if (!doc || typeof doc.text !== 'string' || !Array.isArray(doc.references)) return
      if (!doc.references.some((r) => r.source === MENTION_SOURCE)) return
      let text = ''
      let cursor = 0
      let changed = false
      const refs = []
      for (const r of doc.references.slice().sort((a, b) => a.offset - b.offset)) {
        text += doc.text.slice(cursor, r.offset)
        cursor = r.offset + r.length
        if (r.source !== MENTION_SOURCE) {
          refs.push({ ...r, offset: text.length })
          text += doc.text.slice(r.offset, r.offset + r.length)
          continue
        }
        const n = mentionNumber(ctx, r.ref)
        const label = fmt(T.tag, n || '?')
        const clip = n ? fmt(T.token, n) : T.tokenGone
        if (label !== r.label || clip !== r.clipboardText || !!r.invalid !== !n) changed = true
        const next = { ...r, offset: text.length, length: clip.length, label, clipboardText: clip }
        if (n) delete next.invalid
        else next.invalid = true
        refs.push(next)
        text += clip
      }
      text += doc.text.slice(cursor)
      if (changed) shell.actions.setDraft({ text, references: refs })
    }

    const trackedDrafts = new Map()
    function trackDraft(ctx, sessionId) {
      if (!sessionId || trackedDrafts.has(sessionId)) return
      let shell = null
      try {
        shell = ctx.get('conversation').input.shell(sessionId)
      } catch (e) {}
      if (!shell || !shell.state || typeof shell.state.subscribe !== 'function' || !shell.actions) return
      const signature = () => (shell.state.getSnapshot().attachmentIds || []).join(',')
      let last = signature()
      const unsubscribe = shell.state.subscribe(() => {
        const s = shell.state.getSnapshot()
        const sig = (s.attachmentIds || []).join(',')
        if (sig === last) return
        last = sig
        // 发送时附件会被整体清空：不当成「删图」处理，免得把刚发出的草稿写回输入框
        if (s.phase !== 'plain' || !s.attachmentIds || !s.attachmentIds.length) return
        Promise.resolve().then(() => {
          try {
            relabelDraft(ctx, shell)
          } catch (e) {
            log.warn('relabel image mentions failed', e)
          }
        })
      })
      trackedDrafts.set(sessionId, unsubscribe)
    }

    function installImageMention(ctx) {
      const key = '__' + PLUGIN + ':mention'
      if (window[key]) {
        try {
          window[key]()
        } catch (e) {}
      }
      let disposed = false
      let timer = 0
      let dispose = null
      const cleanup = () => {
        disposed = true
        clearTimeout(timer)
        if (dispose) {
          try {
            dispose()
          } catch (e) {}
        }
        for (const unsubscribe of trackedDrafts.values()) unsubscribe()
        trackedDrafts.clear()
        if (window[key] === cleanup) window[key] = null
      }
      window[key] = cleanup
      // @ 菜单的服务可能比本插件晚就绪
      const attempt = (n) => {
        if (disposed) return
        let triggers = null
        try {
          triggers = ctx.get('inputTriggers')
        } catch (e) {}
        if (triggers && typeof triggers.registerSource === 'function') dispose = registerImageSource(ctx, triggers)
        else if (n < 20) timer = setTimeout(() => attempt(n + 1), 500)
        else log.warn('input trigger service unavailable; @ image mentions disabled')
      }
      attempt(0)
      return cleanup
    }

    // ---------- 紧跟文字的 @ ----------
    // 官方 @ 只认行首或空白后的 @，中文里「奶奶@」不会弹菜单。这种情况由本插件补一个只列图片的小菜单，
    // 选中后同样插入官方引用 chip（编号、标红、发送时写成【图N】都和官方菜单一致）。
    // @ 后面只允许空、数字或「图N」，免得打邮箱地址时误弹。
    const INLINE_QUERY = /^(图|image)?\d*$/i

    function inlineMentionAt(shell) {
      const p = shell.projection
      if (!p || typeof p.detectText !== 'string' || typeof p.caret !== 'number') return null
      if (p.selection && p.selection.start !== p.selection.end) return null
      const text = p.detectText
      const caret = p.caret
      let i = caret - 1
      while (i >= 0 && caret - i <= 12 && text[i] !== '@' && !/\s/.test(text[i])) i--
      if (i <= 0 || text[i] !== '@' || /\s/.test(text[i - 1])) return null
      const query = text.slice(i + 1, caret)
      return INLINE_QUERY.test(query) ? { start: i, query, prefix: text.slice(0, i + 1) } : null
    }

    function installInlineMention(ctx) {
      const key = '__' + PLUGIN + ':inline-mention'
      if (window[key]) window[key]()
      const pop = document.createElement('div')
      pop.className = 'der-atpop'
      pop.setAttribute('role', 'listbox')
      pop.hidden = true
      document.body.appendChild(pop)
      let state = null
      // 按 Esc 关掉的那个 @（以「@ 及其之前的文字」识别）：继续在它后面打字时不再弹
      let dismissed = null
      let frame = 0

      const shellOf = (sessionId) => {
        try {
          return ctx.get('conversation').input.shell(sessionId)
        } catch (e) {
          return null
        }
      }
      const close = () => {
        state = null
        pop.hidden = true
      }
      const pick = (index) => {
        const current = state
        close()
        const im = current && current.items[index]
        const shell = im && shellOf(current.sessionId)
        if (!shell || typeof shell.insertReference !== 'function') return
        const caret = shell.actions.captureInsertion()
        const ok = shell.insertReference(
          { source: MENTION_SOURCE, ref: mentionRef(current.sessionId, im.id), label: fmt(T.tag, im.n), clipboardText: fmt(T.token, im.n) },
          { start: current.start, end: caret.end, draftRev: caret.draftRev }
        )
        if (!ok) log.warn('inline @ image insert refused')
      }
      const render = () => {
        pop.textContent = ''
        const title = document.createElement('div')
        title.className = 'der-atpop-title'
        title.textContent = T.images
        pop.appendChild(title)
        state.items.forEach((im, index) => {
          const row = document.createElement('button')
          row.type = 'button'
          row.setAttribute('role', 'option')
          if (index === state.active) row.setAttribute('data-active', 'true')
          if (im.url) {
            const img = document.createElement('img')
            img.src = im.url
            img.alt = ''
            row.appendChild(img)
          }
          const label = document.createElement('span')
          label.textContent = fmt(T.tag, im.n)
          row.appendChild(label)
          if (im.name) {
            const name = document.createElement('small')
            name.textContent = im.name
            row.appendChild(name)
          }
          // mousedown 里选：不让输入框失焦
          row.addEventListener('mousedown', (e) => {
            e.preventDefault()
            pick(index)
          })
          pop.appendChild(row)
        })
      }
      const place = (editor) => {
        let rect = null
        const sel = window.getSelection()
        if (sel && sel.rangeCount) {
          const r = sel.getRangeAt(0).getBoundingClientRect()
          if (r && (r.left || r.top)) rect = r
        }
        if (!rect) rect = editor.getBoundingClientRect()
        pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - pop.offsetWidth - 8)) + 'px'
        pop.style.top = Math.max(8, rect.top - pop.offsetHeight - 8) + 'px'
      }
      const check = () => {
        frame = 0
        const editor = document.activeElement
        if (!editor || !editor.isContentEditable || !editor.closest('[data-composer-card]') || editor.hasAttribute('data-composer-composing')) return close()
        let ref = null
        try {
          ref = ctx.uiWorkspace.mainReference
        } catch (e) {
          return close()
        }
        const sessionId = ref && ref.sessionId
        const shell = sessionId && shellOf(sessionId)
        const hit = shell ? inlineMentionAt(shell) : null
        if (!hit) {
          dismissed = null
          return close()
        }
        if (hit.prefix === dismissed) return close()
        const q = hit.query.replace(/^(图|image)/i, '')
        const items = draftImages(ctx, sessionId).filter((im) => !q || String(im.n).startsWith(q))
        if (!items.length) return close()
        trackDraft(ctx, sessionId)
        const active = state && state.start === hit.start ? Math.min(state.active, items.length - 1) : 0
        state = { sessionId, start: hit.start, prefix: hit.prefix, items, active }
        render()
        pop.hidden = false
        place(editor)
      }
      const schedule = () => {
        if (!frame) frame = setTimeout(check, 16)
      }
      // 菜单开着时接管上下、回车、Tab、Esc：捕获阶段先于编辑器，回车不会把消息发出去
      const onKey = (e) => {
        if (e.isComposing) return
        // 打字快时最近一次输入的检查还没跑（菜单可能还没弹出、筛选也没更新）：先同步刷新，
        // 否则回车会直接把消息发出去，或选中筛选前的第一项
        if (frame) {
          clearTimeout(frame)
          check()
        }
        if (!state || pop.hidden) return
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          state.active = (state.active + (e.key === 'ArrowDown' ? 1 : -1) + state.items.length) % state.items.length
          render()
        } else if ((e.key === 'Enter' || e.key === 'Tab') && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
          pick(state.active)
        } else if (e.key === 'Escape') {
          dismissed = state.prefix
          close()
        } else return
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
      }
      const onBlur = () => setTimeout(() => {
        if (!document.activeElement || !document.activeElement.isContentEditable) close()
      }, 0)

      const listeners = [
        [document, 'input', schedule, true],
        [document, 'selectionchange', schedule, false],
        [document, 'compositionend', schedule, true],
        [document, 'keydown', onKey, true],
        [document, 'focusout', onBlur, true],
        [window, 'resize', schedule, false]
      ]
      for (const [target, type, fn, capture] of listeners) target.addEventListener(type, fn, capture)
      const cleanup = () => {
        for (const [target, type, fn, capture] of listeners) target.removeEventListener(type, fn, capture)
        clearTimeout(frame)
        pop.remove()
        if (window[key] === cleanup) window[key] = null
      }
      window[key] = cleanup
      return cleanup
    }

    function registerImageSource(ctx, triggers) {
      const source = {
        trigger: '@',
        name: MENTION_SOURCE,
        async candidates(session, { query }) {
          trackDraft(ctx, session.sessionId)
          const q = String(query || '').trim().toLowerCase()
          return draftImages(ctx, session.sessionId)
            .filter((im) => !q || fmt(T.tag, im.n).toLowerCase().includes(q) || String(im.n) === q || im.name.toLowerCase().includes(q))
            .map((im) => ({
              name: fmt(T.tag, im.n),
              description: im.name,
              icon: thumbIcon(im.url),
              section: T.images,
              value: JSON.stringify({ sessionId: session.sessionId, id: im.id, n: im.n })
            }))
        },
        onPick({ candidate }) {
          let v = null
          try {
            v = JSON.parse(candidate.value)
          } catch (e) {}
          if (!v) return undefined
          return { insert: { source: MENTION_SOURCE, ref: mentionRef(v.sessionId, v.id), label: fmt(T.tag, v.n), clipboardText: fmt(T.token, v.n) } }
        },
        codec: {
          clipboardText: (ref) => {
            const n = mentionNumber(ctx, ref)
            return n ? fmt(T.token, n) : T.tokenGone
          },
          // 提交时同步读一次附件顺序：输入框此刻还没清空
          serialize: (ref) => {
            const n = mentionNumber(ctx, ref)
            return n ? Promise.resolve(fmt(T.token, n)) : Promise.reject(new Error(T.errRefGone))
          }
        }
      }
      let dispose = null
      try {
        dispose = triggers.registerSource(source)
      } catch (e) {
        log.warn('register @ image source failed', e)
        return null
      }
      // 有待发图片时 @ 多半是要引用图片：把这一组排在文件、对话前面
      try {
        const list = triggers.live && triggers.live.sources
        if (Array.isArray(list)) {
          const at = list.indexOf(source)
          const first = list.findIndex((s) => s.trigger === '@')
          if (first >= 0 && at > first) {
            list.splice(at, 1)
            list.splice(first, 0, source)
          }
        }
      } catch (e) {}
      return dispose
    }

    // ---------- 编辑卡 ----------

    function useImagePreview(item, loadImage) {
      const [url, setUrl] = React.useState(() => {
        if (item.file) return null
        try {
          return loadImage && loadImage.peek ? loadImage.peek(item.attachment) || null : null
        } catch (e) {
          return null
        }
      })
      React.useEffect(() => {
        if (item.kind !== 'image') return
        if (item.file) {
          const u = URL.createObjectURL(item.file)
          setUrl(u)
          return () => URL.revokeObjectURL(u)
        }
        let alive = true
        if (typeof loadImage === 'function') {
          Promise.resolve(loadImage(item.attachment))
            .then((u) => alive && u && setUrl(String(u)))
            .catch(() => {})
        }
        return () => {
          alive = false
        }
      }, [item.key])
      return url
    }

    function Tile({ item, index, loadImage, dragging, over, onRemove, dragProps }) {
      const url = useImagePreview(item, loadImage)
      const body =
        item.kind === 'image'
          ? url
            ? h('img', { src: url, alt: item.name })
            : null
          : h('div', { className: 'der-tile-file' }, h('span', { className: 'der-tile-ext' }, extOf(item.name)), h('span', null, item.name.slice(0, 24)))
      return h(
        'div',
        {
          className: 'der-tile',
          title: item.name + ' · ' + T.dragHint,
          draggable: true,
          'data-dragging': dragging ? 'true' : undefined,
          'data-over': over ? 'true' : undefined,
          ...dragProps
        },
        body,
        h('span', { className: 'der-index' }, String(index + 1)),
        h(
          'button',
          {
            type: 'button',
            className: 'der-x',
            'aria-label': T.remove + ' ' + item.name,
            title: T.remove,
            onClick: (e) => {
              e.stopPropagation()
              onRemove()
            }
          },
          '×'
        )
      )
    }

    function MentionThumb({ item, loadImage }) {
      const url = useImagePreview(item, loadImage)
      return url ? h('img', { src: url, alt: '' }) : null
    }

    // 正文里的【图N】跟着图片顺序改号：prevKeys / nextKeys 是改动前后图片的 key 顺序，删掉的图变成【图?】
    const TOKEN_RE = /【图(\d+|\?)】|\[Image (\d+|\?)\]/g
    const GONE_RE = /【图\?】|\[Image \?\]/
    function renumberTokens(text, prevKeys, nextKeys) {
      return text.replace(TOKEN_RE, (all, zh, en) => {
        const raw = zh !== undefined ? zh : en
        if (raw === '?') return all
        const key = prevKeys[Number(raw) - 1]
        // 编号超出原有图片数：不是指向这些图片的引用，不动
        if (key === undefined) return all
        const at = nextKeys.indexOf(key)
        const n = at < 0 ? '?' : String(at + 1)
        return zh !== undefined ? '【图' + n + '】' : '[Image ' + n + ']'
      })
    }

    let newSeq = 0
    function filesToItems(files) {
      return Array.from(files).map((file) => ({
        key: 'new:' + ++newSeq,
        kind: /^image\//.test(file.type) ? 'image' : 'file',
        file,
        name: file.name || (/^image\//.test(file.type) ? 'image.png' : T.file)
      }))
    }

    function EditCard({ ctx, sessionId, node, loadImage, onClose }) {
      const initial = React.useMemo(() => splitContent(node.data && node.data.content), [node])
      const [text, setText] = React.useState(initial.text)
      const [items, setItems] = React.useState(initial.items)
      const [dragKey, setDragKey] = React.useState(null)
      const [overKey, setOverKey] = React.useState(null)
      const [dropActive, setDropActive] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      // 文字框里键入 @ 后弹出的图片选择：{ start: @ 的位置, query, active }
      const [mention, setMention] = React.useState(null)
      const areaRef = React.useRef(null)
      const fileRef = React.useRef(null)
      const imageKeysRef = React.useRef(initial.items.filter((it) => it.kind === 'image').map((it) => it.key))
      const isFirst = React.useMemo(() => {
        const seq = node.data && node.data.seq
        return typeof seq === 'number' && resolveCut(ctx, sessionId, seq).kind === 'first'
      }, [node, sessionId])

      React.useLayoutEffect(() => {
        const el = areaRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = Math.min(el.scrollHeight, 360) + 'px'
      }, [text])
      // 内容一改，上一次的校验报错就过时了
      React.useEffect(() => {
        if (!busy) setError('')
      }, [text, items])
      // 调整顺序、删图后，正文里的【图N】改成新编号
      React.useEffect(() => {
        const prev = imageKeysRef.current
        const next = items.filter((it) => it.kind === 'image').map((it) => it.key)
        imageKeysRef.current = next
        if (prev.join('\n') !== next.join('\n')) setText((t) => renumberTokens(t, prev, next))
      }, [items])
      React.useEffect(() => {
        const el = areaRef.current
        if (el) {
          el.focus()
          el.setSelectionRange(el.value.length, el.value.length)
        }
      }, [])

      const addFiles = (files) => {
        if (files && files.length) setItems((prev) => prev.concat(filesToItems(files)))
      }
      const empty = text.trim() === '' && items.length === 0
      const limits = imageLimitsOf(ctx, sessionId)
      const imageCount = items.filter((it) => it.kind === 'image').length

      const submit = async () => {
        if (busy) return
        if (empty) {
          setError(T.errEmpty)
          return
        }
        if (GONE_RE.test(text)) {
          setError(T.errTokenGone)
          return
        }
        const invalid = validateItems(items, limits)
        if (invalid) {
          setError(invalid)
          return
        }
        const seq = node.data && node.data.seq
        setBusy(true)
        setError('')
        try {
          await editAndResend(ctx, { sessionId, messageSeq: typeof seq === 'number' ? seq : Infinity, text, items })
        } catch (e) {
          setBusy(false)
          setError(e && e.message ? e.message : String(e))
        }
      }

      const move = (fromKey, toKey) => {
        if (!fromKey || fromKey === toKey) return
        setItems((prev) => {
          const from = prev.findIndex((it) => it.key === fromKey)
          const to = prev.findIndex((it) => it.key === toKey)
          if (from < 0 || to < 0) return prev
          const next = prev.slice()
          const [moved] = next.splice(from, 1)
          next.splice(to, 0, moved)
          return next
        })
      }

      const imageItems = items.filter((it) => it.kind === 'image')
      const mentionList = mention
        ? imageItems
            .map((item, i) => ({ item, n: i + 1 }))
            .filter(({ item, n }) => {
              const q = mention.query.toLowerCase()
              return !q || String(n).startsWith(q) || fmt(T.tag, n).toLowerCase().includes(q) || item.name.toLowerCase().includes(q)
            })
        : []
      const pickMention = (n) => {
        const el = areaRef.current
        if (!mention || !el) return
        const end = Math.max(el.selectionStart, mention.start + 1)
        const token = fmt(T.token, n)
        const caret = mention.start + token.length
        setText(text.slice(0, mention.start) + token + text.slice(end))
        setMention(null)
        requestAnimationFrame(() => {
          el.focus()
          el.setSelectionRange(caret, caret)
        })
      }
      const trackMention = (value, caret) => {
        if (imageItems.length && caret > 0 && value[caret - 1] === '@' && value.length > text.length) {
          setMention({ start: caret - 1, query: '', active: 0 })
          return
        }
        if (!mention) return
        const query = value.slice(mention.start + 1, caret)
        if (value[mention.start] !== '@' || caret <= mention.start || /\s/.test(query)) setMention(null)
        else if (query !== mention.query) setMention({ ...mention, query, active: 0 })
      }

      const tiles = items.map((item, index) =>
        h(Tile, {
          key: item.key,
          item,
          index,
          loadImage,
          dragging: dragKey === item.key,
          over: overKey === item.key && dragKey !== item.key,
          onRemove: () => setItems((prev) => prev.filter((it) => it.key !== item.key)),
          dragProps: {
            onDragStart: (e) => {
              setDragKey(item.key)
              e.dataTransfer.effectAllowed = 'move'
              try {
                e.dataTransfer.setData('text/plain', item.key)
              } catch (err) {}
            },
            onDragEnter: (e) => {
              if (dragKey) {
                e.preventDefault()
                setOverKey(item.key)
                move(dragKey, item.key)
              }
            },
            onDragOver: (e) => {
              if (dragKey) e.preventDefault()
            },
            onDragEnd: () => {
              setDragKey(null)
              setOverKey(null)
            },
            onDrop: (e) => {
              if (dragKey) {
                e.preventDefault()
                e.stopPropagation()
                setDragKey(null)
                setOverKey(null)
              }
            }
          }
        })
      )

      return h(
        'div',
        {
          className: 'der-card',
          'data-drop': dropActive ? 'true' : undefined,
          // 拖放事件不能冒泡出去：官方输入框在外层监听拖入，会把同一批文件再收一份
          onDragEnter: (e) => e.stopPropagation(),
          onDragOver: (e) => {
            e.stopPropagation()
            const types = Array.from((e.dataTransfer && e.dataTransfer.types) || [])
            if (!dragKey && (types.includes('Files') || (draggedImage && types.includes(IMAGE_MIME)))) {
              e.preventDefault()
              setDropActive(true)
            }
          },
          onDragLeave: (e) => {
            e.stopPropagation()
            if (e.currentTarget === e.target) setDropActive(false)
          },
          onDrop: (e) => {
            e.stopPropagation()
            if (dragKey) return
            setDropActive(false)
            // 从对话里拖来的图片
            if (draggedImage && Array.from((e.dataTransfer && e.dataTransfer.types) || []).includes(IMAGE_MIME)) {
              e.preventDefault()
              imageFile(draggedImage).then(
                (file) => addFiles([file]),
                (err) => setError(T.imgFailed + (err && err.message ? err.message : String(err)))
              )
              return
            }
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
              e.preventDefault()
              addFiles(e.dataTransfer.files)
            }
          }
        },
        h('textarea', {
          ref: areaRef,
          className: 'der-text',
          value: text,
          placeholder: T.placeholder,
          disabled: busy,
          onChange: (e) => {
            trackMention(e.target.value, e.target.selectionStart)
            setText(e.target.value)
          },
          onBlur: () => setMention(null),
          onPaste: (e) => {
            e.stopPropagation()
            const files = e.clipboardData && e.clipboardData.files
            if (files && files.length) {
              e.preventDefault()
              addFiles(files)
              return
            }
            // 从本插件复制的整条消息：文字照常粘贴，图片按原顺序补进来
            const copied = copiedFilesFor(e.clipboardData)
            if (copied && copied.length) addFiles(copied)
          },
          onKeyDown: (e) => {
            if (mention && mentionList.length && !e.nativeEvent.isComposing) {
              const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
              if (step) {
                e.preventDefault()
                setMention({ ...mention, active: (mention.active + step + mentionList.length) % mentionList.length })
                return
              }
              if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
                e.preventDefault()
                pickMention(mentionList[Math.min(mention.active, mentionList.length - 1)].n)
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setMention(null)
                return
              }
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              if (!busy) onClose()
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }
        }),
        mention && mentionList.length
          ? h(
              'div',
              { className: 'der-mention', role: 'listbox' },
              ...mentionList.map(({ item, n }, i) =>
                h(
                  'button',
                  {
                    key: item.key,
                    type: 'button',
                    role: 'option',
                    'aria-selected': i === mention.active,
                    'data-active': i === mention.active ? 'true' : undefined,
                    // mousedown 里选：click 之前文字框已失焦，菜单会先被关掉
                    onMouseDown: (e) => {
                      e.preventDefault()
                      pickMention(n)
                    }
                  },
                  h(MentionThumb, { item, loadImage }),
                  fmt(T.tag, n)
                )
              )
            )
          : null,
        h(
          'div',
          { className: 'der-grid' },
          ...tiles,
          h(
            'button',
            { type: 'button', className: 'der-addtile', title: T.add, 'aria-label': T.add, disabled: busy, onClick: () => fileRef.current && fileRef.current.click() },
            '+'
          ),
          h('input', {
            ref: fileRef,
            className: 'der-file-input',
            type: 'file',
            multiple: true,
            onChange: (e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }
          })
        ),
        error ? h('div', { className: 'der-error', role: 'alert' }, error) : null,
        h(
          'div',
          { className: 'der-foot' },
          h(
            'span',
            { className: 'der-note' },
            (limits ? T.images + ' ' + imageCount + '/' + limits.maxImagesPerMessage + ' · ' : '') +
              (isFirst ? T.footFirst : T.footFork) +
              ' · ' +
              T.keys +
              (imageCount ? ' · ' + T.mentionHint : '')
          ),
          h('button', { type: 'button', className: 'der-btn', disabled: busy, onClick: onClose }, T.cancel),
          h('button', { type: 'button', className: 'der-btn der-btn-primary', disabled: busy || empty, onClick: submit }, busy ? T.sending : T.send)
        )
      )
    }

    // ---------- 消息节点包装 ----------

    const PENCIL =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10.6 2.9a1.6 1.6 0 0 1 2.3 0l.2.2a1.6 1.6 0 0 1 0 2.3l-7.4 7.4-3.1.8.8-3.1 7.2-7.6Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="m9.4 4.2 2.4 2.4" stroke="currentColor" stroke-width="1.1"/></svg>'

    // 把编辑按钮放进官方消息的操作行（时间 + 复制 那一行），沿用复制按钮的样式类；
    // 同时给官方复制按钮挂上「带图片复制」：官方先写入纯文本，稍后用图文版本覆盖
    const ICON_BACK =
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3.5 2.5 7 6 10.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 7h6.5a4 4 0 0 1 0 8H8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>'

    function ensureActions(root, onEdit, onCopy, onOrigin) {
      if (!root) return
      const actions = root.querySelector('[data-clock="start"]') || root.querySelector('[class*="_actions"]')
      if (!actions) return
      const copy = actions.querySelector('button:not([data-der-edit]):not([data-der-origin])')
      if (copy) copy.onclick = () => setTimeout(onCopy, 30)
      let back = actions.querySelector('button[data-der-origin]')
      if (onOrigin && !back) {
        back = document.createElement('button')
        back.type = 'button'
        back.setAttribute('data-der-origin', 'true')
        back.className = (copy ? copy.className + ' ' : '') + 'der-origin'
        back.title = T.originTitle
        back.setAttribute('aria-label', T.originTitle)
        back.innerHTML = ICON_BACK + '<span>' + escapeHtml(T.origin) + '</span>'
        actions.insertBefore(back, actions.firstChild)
      } else if (!onOrigin && back) back.remove()
      if (back && onOrigin)
        back.onclick = (e) => {
          e.stopPropagation()
          onOrigin()
        }
      let btn = actions.querySelector('button[data-der-edit]')
      if (!btn) {
        btn = document.createElement('button')
        btn.type = 'button'
        btn.setAttribute('data-der-edit', 'true')
        btn.className = copy ? copy.className : ''
        btn.setAttribute('aria-label', T.edit)
        btn.title = T.edit
        btn.innerHTML = PENCIL
        actions.appendChild(btn)
      }
      btn.onclick = (e) => {
        e.stopPropagation()
        onEdit()
      }
    }

    // 找不到官方组件时（宿主改了注册方式）至少把文字显示出来，并带上编辑入口
    function FallbackView({ node }) {
      const { text, items } = splitContent(node && node.data && node.data.content)
      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 } },
        h(
          'div',
          { style: { maxWidth: '82%', padding: '10px 16px', borderRadius: 22, background: 'var(--dsw-specific-bubble)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' } },
          text + (items.length ? '\n[' + items.length + ' ' + T.file + ']' : '')
        ),
        h('div', { 'data-clock': 'start', style: { display: 'flex', gap: 8 } })
      )
    }

    // 注册表可能把组件包一层（memo 等），按标记识别自己，避免把自己当成官方组件递归渲染
    function isSelf(component) {
      for (let c = component, i = 0; c && i < 4; c = c.type || c.render, i++) {
        if (c.__derSelf) return true
      }
      return false
    }

    function makeNode(ctx, slotKey) {
      function EditableUserNode(props) {
        syncLocale(ctx)
        const [editing, setEditing] = React.useState(false)
        const rootRef = React.useRef(null)
        const Official = React.useMemo(() => {
          const entries = ctx.slots.entries(NODE_SLOT) || []
          let best = null
          for (const entry of entries) {
            if (!entry || !entry.options || entry.options.key !== slotKey || isSelf(entry.component)) continue
            const p = typeof entry.options.priority === 'number' ? entry.options.priority : 0
            if (best === null || p < best.p) best = { p, component: entry.component, locale: entry.locale }
          }
          if (!best) return null
          // 槽系统按注册项的 locale 给组件传 t；官方组件绕过槽直接渲染时要自己补上
          let t = null
          try {
            const localeSvc = ctx.get('locale')
            if (localeSvc && typeof best.locale === 'string') t = localeSvc.bind(best.locale)
          } catch (e) {}
          return { component: best.component, t }
        }, [])
        const propsRef = React.useRef(props)
        propsRef.current = props
        const onEdit = React.useCallback(() => setEditing(true), [])
        const onCopy = React.useCallback(() => {
          const p = propsRef.current
          copyWithAttachments(ctx, p.sessionId, p.node).catch((e) => log.warn('copy with attachments failed', e))
        }, [])
        const origin = originFor(ctx, props.sessionId, props.node && props.node.data && props.node.data.seq)
        const originFrom = origin ? origin.from : null
        const onOrigin = React.useMemo(() => (originFrom ? () => openOrigin(ctx, originFrom) : null), [originFrom])
        React.useLayoutEffect(() => {
          if (!editing) ensureActions(rootRef.current, onEdit, onCopy, onOrigin)
        })
        React.useEffect(() => {
          if (editing || !rootRef.current || typeof MutationObserver === 'undefined') return
          const obs = new MutationObserver(() => ensureActions(rootRef.current, onEdit, onCopy, onOrigin))
          obs.observe(rootRef.current, { childList: true, subtree: true })
          return () => obs.disconnect()
        }, [editing, onOrigin])

        if (editing) {
          return h(
            'div',
            { ref: rootRef, 'data-der-node': 'editing', style: { width: '100%' } },
            h(EditCard, {
              ctx,
              sessionId: props.sessionId,
              node: props.node,
              loadImage: props.loadImage,
              onClose: () => setEditing(false)
            })
          )
        }
        const officialProps = Official && Official.t ? { ...props, t: Official.t } : props
        const view = Official ? h(Official.component, officialProps) : h(FallbackView, { node: props.node })
        return h('div', { ref: rootRef, 'data-der-node': 'view', style: { display: 'contents' } }, view)
      }
      EditableUserNode.__derSelf = true
      return EditableUserNode
    }

    function shadowPriority(entries, key) {
      let priority = -1
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (!entry || !entry.options || entry.options.key !== key) continue
        const p = typeof entry.options.priority === 'number' ? entry.options.priority : 0
        if (p <= priority) priority = p - 1
      }
      return priority
    }

    return {
      name: PLUGIN,
      inject: ['slots', 'sessions', 'workspaces', 'uiWorkspace', 'uiConversation'],
      apply(ctx) {
        syncLocale(ctx)
        injectCss()
        // 文档级监听都交给 ctx.effect：插件停用或热重载时一并撤掉
        const effect = (install) => (typeof ctx.effect === 'function' ? ctx.effect(() => install(ctx)) : install(ctx))
        effect(installPasteRestore)
        effect(installComposerReorder)
        effect(installImageActions)
        effect(installImageMention)
        effect(installInlineMention)
        const Node = makeNode(ctx, 'user')
        try {
          ctx.slots.inject(NODE_SLOT, () =>
            ctx.slots.register({ name: NODE_SLOT, key: 'user', priority: shadowPriority(ctx.slots.entries(NODE_SLOT), 'user') }, Node)
          )
        } catch (e) {
          log.warn('register failed', e)
        }
        // 调试：localStorage['dsh-resend-editor:debug'] = '1' 后刷新，可在控制台用 window.__dshResendEditor 查看运行时
        try {
          if (localStorage.getItem(PLUGIN + ':debug') === '1') window.__dshResendEditor = { ctx, resolveCut }
        } catch (e) {}
        log.info('applied')
      }
    }
  }
})
