// 本地假模型：OpenAI chat completions 兼容，只回一句固定文本，供隔离测试环境产生完整轮次。
// 用法：node dev/mock-llm.mjs [port]
import { createServer } from 'node:http'

const port = Number(process.argv[2] || 43125)

function reply(messages) {
  const last = [...messages].reverse().find((m) => m.role === 'user')
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
    const text = reply(payload.messages || [])
    const id = 'chatcmpl-mock-' + Date.now()
    const base = { id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'mock-1' }
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
