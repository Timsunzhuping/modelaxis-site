// Upstream provider adapters. Common contract:
//   chatOnce(ep, body, ctx)   -> { content, tokensIn, tokensOut, finishReason }
//   chatStream(ep, body, ctx) -> async generator yielding {delta:string},
//                                returning { tokensIn, tokensOut, finishReason }
// Adapters throw UpstreamError for retryable provider failures (router fails over),
// and ClientError for caller mistakes (returned to the client as-is).
import { estimateTokens } from './catalog.mjs';

export class UpstreamError extends Error {
  constructor(message, status = 502) { super(message); this.upstream = true; this.status = status; }
}
export class ClientError extends Error {
  constructor(message, status = 400, code = 'invalid_request') { super(message); this.status = status; this.code = code; }
}

const lastText = messages => {
  const content = messages[messages.length - 1]?.content ?? '';
  return typeof content === 'string' ? content : JSON.stringify(content);
};
const allText = messages => messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');

// ---------------------------------------------------------------- mock ----
// Deterministic simulator so the entire platform (auth, billing, routing,
// streaming, failover) is testable with zero upstream keys.
const mock = {
  reply(ep, body) {
    const q = lastText(body.messages).slice(0, 200);
    return `[simulated · ${ep.model} @ ${ep.host} · ${ep.region}] ` +
      `You said: "${q}". This deterministic response was produced by the ModelAxis mock provider; ` +
      `configure a real provider key to route this request upstream.`;
  },
  usage(body, content) {
    return { tokensIn: estimateTokens(allText(body.messages)), tokensOut: estimateTokens(content) };
  },
  async chatOnce(ep, body) {
    const content = this.reply(ep, body);
    return { content, ...this.usage(body, content), finishReason: 'stop' };
  },
  async *chatStream(ep, body) {
    const content = this.reply(ep, body);
    const words = content.split(/(?<= )/);
    for (const w of words) {
      await new Promise(r => setTimeout(r, 2));
      yield { delta: w };
    }
    return { ...this.usage(body, content), finishReason: 'stop' };
  },
};

// -------------------------------------------------------------- openai ----
// Serves OpenAI itself plus every OpenAI-compatible upstream (DeepSeek, xAI,
// Moonshot, Mistral, …).
function openaiBody(ep, body, stream) {
  const out = { model: ep.upstreamId, messages: body.messages, stream };
  for (const k of ['temperature', 'top_p', 'max_tokens', 'stop', 'tools', 'tool_choice', 'response_format', 'seed'])
    if (body[k] !== undefined) out[k] = body[k];
  if (stream) out.stream_options = { include_usage: true };
  return out;
}

async function httpJson(url, opts) {
  let res;
  try { res = await fetch(url, opts); }
  catch (e) { throw new UpstreamError('upstream unreachable: ' + e.message); }
  if (res.status === 400 || res.status === 404 || res.status === 422) {
    const text = await res.text().catch(() => '');
    throw new ClientError(`upstream rejected request: ${text.slice(0, 300)}`);
  }
  if (!res.ok) throw new UpstreamError(`upstream ${res.status}`, res.status >= 500 ? 502 : res.status);
  return res;
}

async function* sseLines(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
    }
  }
}

const openai = {
  headers: (ctx) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.apiKey}` }),
  async chatOnce(ep, body, ctx) {
    const res = await httpJson(`${ep.baseUrl}/chat/completions`, {
      method: 'POST', headers: this.headers(ctx), body: JSON.stringify(openaiBody(ep, body, false)), signal: ctx.signal,
    });
    const json = await res.json();
    const choice = json.choices?.[0];
    return {
      content: choice?.message?.content ?? '',
      tokensIn: json.usage?.prompt_tokens ?? estimateTokens(allText(body.messages)),
      tokensOut: json.usage?.completion_tokens ?? estimateTokens(choice?.message?.content ?? ''),
      finishReason: choice?.finish_reason ?? 'stop',
    };
  },
  async *chatStream(ep, body, ctx) {
    const res = await httpJson(`${ep.baseUrl}/chat/completions`, {
      method: 'POST', headers: this.headers(ctx), body: JSON.stringify(openaiBody(ep, body, true)), signal: ctx.signal,
    });
    let usage = null, finish = 'stop', outChars = 0;
    for await (const data of sseLines(res)) {
      if (data === '[DONE]') break;
      let json; try { json = JSON.parse(data); } catch { continue; }
      if (json.usage) usage = json.usage;
      const delta = json.choices?.[0]?.delta?.content;
      if (json.choices?.[0]?.finish_reason) finish = json.choices[0].finish_reason;
      if (delta) { outChars += delta.length; yield { delta }; }
    }
    return {
      tokensIn: usage?.prompt_tokens ?? estimateTokens(allText(body.messages)),
      tokensOut: usage?.completion_tokens ?? Math.max(1, Math.ceil(outChars / 4)),
      finishReason: finish,
    };
  },
};

// ----------------------------------------------------------- anthropic ----
function anthropicBody(ep, body, stream) {
  const system = body.messages.filter(m => m.role === 'system').map(m => m.content).join('\n') || undefined;
  const messages = body.messages.filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  const out = { model: ep.upstreamId, messages, max_tokens: body.max_tokens ?? 4096, stream };
  if (system) out.system = system;
  for (const k of ['temperature', 'top_p', 'stop_sequences']) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

const anthropic = {
  headers: ctx => ({ 'Content-Type': 'application/json', 'x-api-key': ctx.apiKey, 'anthropic-version': '2023-06-01' }),
  async chatOnce(ep, body, ctx) {
    const res = await httpJson(`${ep.baseUrl}/v1/messages`, {
      method: 'POST', headers: this.headers(ctx), body: JSON.stringify(anthropicBody(ep, body, false)), signal: ctx.signal,
    });
    const json = await res.json();
    const content = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return {
      content,
      tokensIn: json.usage?.input_tokens ?? estimateTokens(allText(body.messages)),
      tokensOut: json.usage?.output_tokens ?? estimateTokens(content),
      finishReason: json.stop_reason === 'max_tokens' ? 'length' : 'stop',
    };
  },
  async *chatStream(ep, body, ctx) {
    const res = await httpJson(`${ep.baseUrl}/v1/messages`, {
      method: 'POST', headers: this.headers(ctx), body: JSON.stringify(anthropicBody(ep, body, true)), signal: ctx.signal,
    });
    let tokensIn = 0, tokensOut = 0, finish = 'stop';
    for await (const data of sseLines(res)) {
      let json; try { json = JSON.parse(data); } catch { continue; }
      if (json.type === 'message_start') tokensIn = json.message?.usage?.input_tokens ?? 0;
      if (json.type === 'content_block_delta' && json.delta?.text) yield { delta: json.delta.text };
      if (json.type === 'message_delta') {
        tokensOut = json.usage?.output_tokens ?? tokensOut;
        if (json.delta?.stop_reason === 'max_tokens') finish = 'length';
      }
    }
    return { tokensIn: tokensIn || estimateTokens(allText(body.messages)), tokensOut: tokensOut || 1, finishReason: finish };
  },
};

// -------------------------------------------------------------- google ----
function googleBody(body) {
  const system = body.messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const contents = body.messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
  }));
  const out = { contents };
  if (system) out.systemInstruction = { parts: [{ text: system }] };
  const gen = {};
  if (body.temperature !== undefined) gen.temperature = body.temperature;
  if (body.max_tokens !== undefined) gen.maxOutputTokens = body.max_tokens;
  if (Object.keys(gen).length) out.generationConfig = gen;
  return out;
}

const google = {
  async chatOnce(ep, body, ctx) {
    const res = await httpJson(`${ep.baseUrl}/v1beta/models/${ep.upstreamId}:generateContent?key=${ctx.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(googleBody(body)), signal: ctx.signal,
    });
    const json = await res.json();
    const content = (json.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    return {
      content,
      tokensIn: json.usageMetadata?.promptTokenCount ?? estimateTokens(allText(body.messages)),
      tokensOut: json.usageMetadata?.candidatesTokenCount ?? estimateTokens(content),
      finishReason: json.candidates?.[0]?.finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
    };
  },
  async *chatStream(ep, body, ctx) {
    const res = await httpJson(`${ep.baseUrl}/v1beta/models/${ep.upstreamId}:streamGenerateContent?alt=sse&key=${ctx.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(googleBody(body)), signal: ctx.signal,
    });
    let tokensIn = 0, tokensOut = 0, outChars = 0;
    for await (const data of sseLines(res)) {
      let json; try { json = JSON.parse(data); } catch { continue; }
      tokensIn = json.usageMetadata?.promptTokenCount ?? tokensIn;
      tokensOut = json.usageMetadata?.candidatesTokenCount ?? tokensOut;
      const text = (json.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
      if (text) { outChars += text.length; yield { delta: text }; }
    }
    return {
      tokensIn: tokensIn || estimateTokens(allText(body.messages)),
      tokensOut: tokensOut || Math.max(1, Math.ceil(outChars / 4)),
      finishReason: 'stop',
    };
  },
};

export const ADAPTERS = { mock, openai, anthropic, google };
