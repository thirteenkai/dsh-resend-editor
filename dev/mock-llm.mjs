// 本地假模型：OpenAI chat completions 兼容，只回一句固定文本，供隔离测试环境产生完整轮次。
// 用户消息含「读图 <路径>」时先发起一次 read_image 工具调用，用来产生工具结果里的图片；
// 含「出图 <路径>」时回复 Markdown 图片，模拟 DeepSeek 生成图片后在回复里展示。
// 用法：node dev/mock-llm.mjs [port]
import { createServer } from 'node:http'

const port = Number(process.argv[2] || 43125)

// 只看最后一条 assistant／tool 之后的用户消息（宿主会在用户消息后追加时间等系统注记）
function trailingUserText(messages) {
  let text = ''
  for (let i = messages.length - 1; i >= 0 && messages[i].role === 'user'; i--) {
    const c = messages[i].content
    text = (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p.type === 'text').map((p) => p.text).join('') : '') + text
  }
  return text
}

function readImageCall(messages) {
  const m = /读图\s+(\S+)/.exec(trailingUserText(messages))
  return m ? m[1] : null
}

function reply(messages) {
  const tail = messages[messages.length - 1]
  if (tail && tail.role === 'tool') return '看到了这张图。'
  const last = [...messages].reverse().find((m) => m.role === 'user')
  const drawn = trailingUserText(messages).match(/出图\s+(\S+)/g)
  if (drawn) return '生成好了：\n\n' + drawn.map((d, i) => `![生成图${i + 1}](${d.replace(/^出图\s+/, '')})`).join('\n\n')
  const content = last && last.content
  let text = ''
  let images = 0
  if (typeof content === 'string') text = content
  else if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === 'text') text += part.text
      else if (part.type === 'image_url') images++
    }
  }
  return `收到：${text.slice(0, 40)}（${images} 张图）`
}

createServer((req, res) => {
  if (req.method === 'GET' && req.url.endsWith('/models')) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-1', object: 'model' }] }))
    return
  }
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    let payload = {}
    try { payload = JSON.parse(body || '{}') } catch {}
    const messages = payload.messages || []
    const text = reply(messages)
    const imagePath = readImageCall(messages)
    const id = 'chatcmpl-mock-' + Date.now()
    const base = { id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'mock-1' }
    if (imagePath && payload.stream) {
      const call = { index: 0, id: 'call_' + Date.now(), type: 'function', function: { name: 'read_image', arguments: JSON.stringify({ file_path: imagePath }) } }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [call] }, finish_reason: null }] })}\n\n`)
      res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\n`)
      res.end('data: [DONE]\n\n')
      return
    }
    if (payload.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] })}\n\n`)
      res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\n`)
      res.end('data: [DONE]\n\n')
    } else {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }))
    }
  })
}).listen(port, '127.0.0.1', () => console.log(`mock llm on http://127.0.0.1:${port}/v1`))
