// dsh-resend-editor：给已发出的用户消息加「编辑」按钮。
// 编辑卡里可以改文字、删图片、拖动调整顺序、补图，发送后：
//   - 非第一条：从上一轮结束处 fork 出新会话，再把改后的内容发出去；
//   - 第一条：前面没有可切的轮次，直接在同一工作区开新会话发出去。
// 原会话默认归档（可在归档里找回）。消息气泡本身仍由官方组件渲染，本插件只包一层。
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
          file: '文件'
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
          file: 'File'
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
      const areaRef = React.useRef(null)
      const fileRef = React.useRef(null)
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
            if (!dragKey && e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
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
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
              e.preventDefault()
              addFiles(e.dataTransfer.files)
            }
            setDropActive(false)
          }
        },
        h('textarea', {
          ref: areaRef,
          className: 'der-text',
          value: text,
          placeholder: T.placeholder,
          disabled: busy,
          onChange: (e) => setText(e.target.value),
          onPaste: (e) => {
            const files = e.clipboardData && e.clipboardData.files
            if (files && files.length) {
              e.preventDefault()
              e.stopPropagation()
              addFiles(files)
            }
          },
          onKeyDown: (e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              if (!busy) onClose()
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }
        }),
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
            (limits ? T.images + ' ' + imageCount + '/' + limits.maxImagesPerMessage + ' · ' : '') + (isFirst ? T.footFirst : T.footFork) + ' · ' + T.keys
          ),
          h('button', { type: 'button', className: 'der-btn', disabled: busy, onClick: onClose }, T.cancel),
          h('button', { type: 'button', className: 'der-btn der-btn-primary', disabled: busy || empty, onClick: submit }, busy ? T.sending : T.send)
        )
      )
    }

    // ---------- 消息节点包装 ----------

    const PENCIL =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10.6 2.9a1.6 1.6 0 0 1 2.3 0l.2.2a1.6 1.6 0 0 1 0 2.3l-7.4 7.4-3.1.8.8-3.1 7.2-7.6Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="m9.4 4.2 2.4 2.4" stroke="currentColor" stroke-width="1.1"/></svg>'

    // 把编辑按钮放进官方消息的操作行（时间 + 复制 那一行），沿用复制按钮的样式类
    function ensureEditButton(root, onEdit) {
      if (!root) return
      const actions = root.querySelector('[data-clock="start"]') || root.querySelector('[class*="_actions"]')
      if (!actions) return
      let btn = actions.querySelector('button[data-der-edit]')
      if (!btn) {
        const copy = actions.querySelector('button')
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
        React.useLayoutEffect(() => {
          if (!editing) ensureEditButton(rootRef.current, () => setEditing(true))
        })
        React.useEffect(() => {
          if (editing || !rootRef.current || typeof MutationObserver === 'undefined') return
          const obs = new MutationObserver(() => ensureEditButton(rootRef.current, () => setEditing(true)))
          obs.observe(rootRef.current, { childList: true, subtree: true })
          return () => obs.disconnect()
        }, [editing])

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
