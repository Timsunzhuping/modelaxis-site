// ModelAxis catalog data.
// Prices in USD per 1M tokens. list* = provider list price when ModelAxis routes below list.
// latency = p50 time-to-first-token (ms), tps = median output throughput.
window.MX_MODELS = [
  // ---- OpenAI ----
  { id: "openai/gpt-5", name: "GPT-5", provider: "OpenAI", ctx: 400000, maxOut: 128000, modality: "text+image", open: false, reasoning: true,
    in: 1.19, out: 9.50, listIn: 1.25, listOut: 10.00, latency: 187, tps: 142, released: "2025-08", share: 9.4, new: false,
    desc: "OpenAI's flagship unified model with adjustable reasoning effort. Strong across coding, math, and agentic tool use." },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini", provider: "OpenAI", ctx: 400000, maxOut: 128000, modality: "text+image", open: false, reasoning: true,
    in: 0.24, out: 1.90, listIn: 0.25, listOut: 2.00, latency: 142, tps: 178, released: "2025-08", share: 4.6,
    desc: "Cost-efficient tier of GPT-5 for well-defined tasks. Keeps most of the reasoning quality at a fifth of the price." },
  { id: "openai/gpt-5-nano", name: "GPT-5 Nano", provider: "OpenAI", ctx: 400000, maxOut: 128000, modality: "text+image", open: false, reasoning: true,
    in: 0.05, out: 0.40, latency: 96, tps: 246, released: "2025-08", share: 2.1,
    desc: "Fastest, cheapest GPT-5 variant. Built for summarization, classification, and high-volume extraction." },
  { id: "openai/gpt-4.1", name: "GPT-4.1", provider: "OpenAI", ctx: 1047576, maxOut: 32768, modality: "text+image", open: false, reasoning: false,
    in: 2.00, out: 8.00, latency: 231, tps: 118, released: "2025-04", share: 2.8,
    desc: "Long-context workhorse with a 1M-token window. Reliable instruction following for production pipelines." },
  { id: "openai/o3", name: "o3", provider: "OpenAI", ctx: 200000, maxOut: 100000, modality: "text+image", open: false, reasoning: true,
    in: 2.00, out: 8.00, latency: 418, tps: 88, released: "2025-04", share: 1.4,
    desc: "Deliberate reasoning model for hard math, science, and multi-step planning problems." },
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", provider: "OpenAI", ctx: 131072, maxOut: 32768, modality: "text", open: true, reasoning: true,
    in: 0.09, out: 0.45, latency: 152, tps: 210, released: "2025-08", share: 1.6,
    desc: "OpenAI's open-weight MoE released under Apache 2.0. Near o4-mini quality, hostable anywhere." },

  // ---- Anthropic ----
  { id: "anthropic/claude-opus-4.1", name: "Claude Opus 4.1", provider: "Anthropic", ctx: 200000, maxOut: 32000, modality: "text+image", open: false, reasoning: true,
    in: 14.25, out: 71.25, listIn: 15.00, listOut: 75.00, latency: 213, tps: 82, released: "2025-08", share: 2.2,
    desc: "Anthropic's most capable model for frontier coding and long-horizon agentic work." },
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", provider: "Anthropic", ctx: 200000, maxOut: 64000, modality: "text+image", open: false, reasoning: true,
    in: 2.85, out: 14.25, listIn: 3.00, listOut: 15.00, latency: 176, tps: 124, released: "2025-09", share: 11.8,
    desc: "The default choice for coding agents: state-of-the-art on SWE-bench with balanced cost and speed." },
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", provider: "Anthropic", ctx: 200000, maxOut: 64000, modality: "text+image", open: false, reasoning: true,
    in: 0.95, out: 4.75, listIn: 1.00, listOut: 5.00, latency: 118, tps: 196, released: "2025-10", share: 4.9, new: true,
    desc: "Near-Sonnet quality at a third of the price, with sub-second first tokens. Ideal for interactive products." },

  // ---- Google ----
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", ctx: 1048576, maxOut: 65536, modality: "omni", open: false, reasoning: true,
    in: 1.19, out: 9.50, listIn: 1.25, listOut: 10.00, latency: 341, tps: 105, released: "2025-03", share: 6.7,
    desc: "Google's flagship thinking model. 1M context, strong multimodal and long-document analysis." },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", ctx: 1048576, maxOut: 65536, modality: "omni", open: false, reasoning: true,
    in: 0.28, out: 2.38, listIn: 0.30, listOut: 2.50, latency: 154, tps: 188, released: "2025-04", share: 10.3,
    desc: "The price-performance sweet spot: 1M context, native audio and vision, controllable thinking budget." },
  { id: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", provider: "Google", ctx: 1048576, maxOut: 65536, modality: "omni", open: false, reasoning: false,
    in: 0.10, out: 0.40, latency: 92, tps: 254, released: "2025-06", share: 3.1,
    desc: "Ultra-low-cost tier for translation, classification, and high-throughput batch jobs." },
  { id: "google/gemma-3-27b", name: "Gemma 3 27B", provider: "Google", ctx: 131072, maxOut: 16384, modality: "text+image", open: true, reasoning: false,
    in: 0.09, out: 0.17, latency: 134, tps: 172, released: "2025-03", share: 0.9,
    desc: "Open-weight multimodal model that runs on a single accelerator. Great quality per watt." },

  // ---- Meta ----
  { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick", provider: "Meta", ctx: 1048576, maxOut: 16384, modality: "text+image", open: true, reasoning: false,
    in: 0.18, out: 0.55, latency: 168, tps: 164, released: "2025-04", share: 2.4,
    desc: "400B-parameter MoE with 17B active. Open weights, 1M context, natively multimodal." },
  { id: "meta-llama/llama-4-scout", name: "Llama 4 Scout", provider: "Meta", ctx: 10485760, maxOut: 16384, modality: "text+image", open: true, reasoning: false,
    in: 0.08, out: 0.30, latency: 141, tps: 196, released: "2025-04", share: 1.2,
    desc: "Fits on one H100 and reads a 10M-token window — the longest context of any open model." },
  { id: "meta-llama/llama-3.3-70b", name: "Llama 3.3 70B", provider: "Meta", ctx: 131072, maxOut: 16384, modality: "text", open: true, reasoning: false,
    in: 0.10, out: 0.32, latency: 129, tps: 208, released: "2024-12", share: 1.8,
    desc: "The proven open workhorse. Massive ecosystem, predictable behavior, very cheap to serve." },

  // ---- DeepSeek ----
  { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2", provider: "DeepSeek", ctx: 131072, maxOut: 65536, modality: "text", open: true, reasoning: true,
    in: 0.26, out: 0.40, listIn: 0.28, listOut: 0.42, latency: 156, tps: 152, released: "2025-09", share: 7.2,
    desc: "Sparse-attention V3.2 cuts long-context cost in half. Frontier-adjacent quality at open-weight prices." },
  { id: "deepseek/deepseek-r1-0528", name: "DeepSeek R1 0528", provider: "DeepSeek", ctx: 131072, maxOut: 65536, modality: "text", open: true, reasoning: true,
    in: 0.48, out: 2.05, listIn: 0.55, listOut: 2.19, latency: 384, tps: 96, released: "2025-05", share: 2.6,
    desc: "The open reasoning model that started the price war. Transparent chain-of-thought, MIT licensed." },

  // ---- Qwen ----
  { id: "qwen/qwen3-235b-a22b", name: "Qwen3 235B A22B", provider: "Qwen", ctx: 262144, maxOut: 32768, modality: "text", open: true, reasoning: true,
    in: 0.18, out: 0.55, latency: 172, tps: 148, released: "2025-04", share: 2.9,
    desc: "Hybrid thinking MoE from Alibaba. Toggle reasoning on demand; excellent multilingual coverage." },
  { id: "qwen/qwen3-coder-480b", name: "Qwen3 Coder 480B", provider: "Qwen", ctx: 262144, maxOut: 65536, modality: "text", open: true, reasoning: false,
    in: 0.32, out: 1.30, latency: 189, tps: 132, released: "2025-07", share: 3.4,
    desc: "Agentic coding specialist tuned for repository-scale edits and long tool-use loops." },
  { id: "qwen/qwen3-max", name: "Qwen3 Max", provider: "Qwen", ctx: 262144, maxOut: 65536, modality: "text", open: false, reasoning: true,
    in: 1.15, out: 5.70, listIn: 1.20, listOut: 6.00, latency: 224, tps: 112, released: "2025-09", share: 1.3,
    desc: "Alibaba's trillion-parameter flagship. Top-tier math and coding with strong Chinese-English balance." },

  // ---- Mistral ----
  { id: "mistralai/mistral-medium-3", name: "Mistral Medium 3", provider: "Mistral", ctx: 131072, maxOut: 32768, modality: "text+image", open: false, reasoning: false,
    in: 0.40, out: 2.00, latency: 162, tps: 158, released: "2025-05", share: 1.1,
    desc: "Enterprise-grade performance at 8× lower cost than comparable frontier models. EU-hosted options." },
  { id: "mistralai/magistral-medium", name: "Magistral Medium", provider: "Mistral", ctx: 131072, maxOut: 40960, modality: "text", open: false, reasoning: true,
    in: 2.00, out: 5.00, latency: 356, tps: 92, released: "2025-06", share: 0.5,
    desc: "Mistral's reasoning line with traceable multilingual chain-of-thought — popular for regulated industries." },
  { id: "mistralai/codestral-2508", name: "Codestral 2508", provider: "Mistral", ctx: 262144, maxOut: 32768, modality: "text", open: false, reasoning: false,
    in: 0.30, out: 0.90, latency: 108, tps: 232, released: "2025-08", share: 0.8,
    desc: "Fill-in-the-middle specialist for IDE completion. Very fast first tokens at completion-friendly prices." },

  // ---- xAI ----
  { id: "x-ai/grok-4", name: "Grok 4", provider: "xAI", ctx: 262144, maxOut: 65536, modality: "text+image", open: false, reasoning: true,
    in: 3.00, out: 15.00, latency: 262, tps: 98, released: "2025-07", share: 1.7,
    desc: "xAI's frontier reasoning model with native tool use and real-time X search integration." },
  { id: "x-ai/grok-4-fast", name: "Grok 4 Fast", provider: "xAI", ctx: 2000000, maxOut: 65536, modality: "text+image", open: false, reasoning: true,
    in: 0.20, out: 0.50, latency: 138, tps: 214, released: "2025-09", share: 5.8,
    desc: "2M-token context at commodity prices. One of the highest intelligence-per-dollar scores on the axis." },
  { id: "x-ai/grok-code-fast-1", name: "Grok Code Fast 1", provider: "xAI", ctx: 262144, maxOut: 32768, modality: "text", open: false, reasoning: true,
    in: 0.20, out: 1.50, latency: 121, tps: 226, released: "2025-08", share: 4.2,
    desc: "Speedy, economical coding model built for agentic loops in IDEs and CI." },

  // ---- Moonshot ----
  { id: "moonshotai/kimi-k2", name: "Kimi K2", provider: "Moonshot AI", ctx: 262144, maxOut: 32768, modality: "text", open: true, reasoning: false,
    in: 0.52, out: 2.10, listIn: 0.60, listOut: 2.50, latency: 178, tps: 138, released: "2025-07", share: 3.1,
    desc: "1T-parameter open MoE with standout agentic and front-end coding ability." },
  { id: "moonshotai/kimi-k2-thinking", name: "Kimi K2 Thinking", provider: "Moonshot AI", ctx: 262144, maxOut: 65536, modality: "text", open: true, reasoning: true,
    in: 0.55, out: 2.40, latency: 342, tps: 104, released: "2025-11", share: 2.4, new: true,
    desc: "Open thinking-agent model that sustains 200–300 sequential tool calls without drift." },

  // ---- Z.ai ----
  { id: "z-ai/glm-4.6", name: "GLM-4.6", provider: "Z.ai", ctx: 204800, maxOut: 131072, modality: "text", open: true, reasoning: true,
    in: 0.45, out: 1.80, listIn: 0.60, listOut: 2.20, latency: 166, tps: 156, released: "2025-09", share: 2.8,
    desc: "Zhipu's flagship open model — a favorite for coding agents on a budget, MIT licensed." },

  // ---- MiniMax ----
  { id: "minimax/minimax-m2", name: "MiniMax M2", provider: "MiniMax", ctx: 204800, maxOut: 65536, modality: "text", open: true, reasoning: true,
    in: 0.28, out: 1.10, latency: 158, tps: 172, released: "2025-10", share: 1.9, new: true,
    desc: "230B-A10B open MoE optimized for end-to-end agent workflows at 8% of flagship pricing." },

  // ---- Cohere ----
  { id: "cohere/command-a", name: "Command A", provider: "Cohere", ctx: 262144, maxOut: 8192, modality: "text", open: false, reasoning: false,
    in: 2.38, out: 9.50, listIn: 2.50, listOut: 10.00, latency: 198, tps: 126, released: "2025-03", share: 0.4,
    desc: "Enterprise RAG and tool-use specialist with best-in-class retrieval grounding, 23 languages." },

  // ---- Amazon ----
  { id: "amazon/nova-pro", name: "Nova Pro", provider: "Amazon", ctx: 300000, maxOut: 16384, modality: "omni", open: false, reasoning: false,
    in: 0.80, out: 3.20, latency: 216, tps: 122, released: "2024-12", share: 0.6,
    desc: "AWS's multimodal workhorse — balanced accuracy, speed, and cost with video understanding." },
  { id: "amazon/nova-lite", name: "Nova Lite", provider: "Amazon", ctx: 300000, maxOut: 16384, modality: "omni", open: false, reasoning: false,
    in: 0.06, out: 0.24, latency: 112, tps: 238, released: "2024-12", share: 0.5,
    desc: "Very low-cost multimodal processing for image, video, and document workloads." },

  // ---- Microsoft ----
  { id: "microsoft/phi-4", name: "Phi-4", provider: "Microsoft", ctx: 16384, maxOut: 8192, modality: "text", open: true, reasoning: false,
    in: 0.06, out: 0.14, latency: 88, tps: 262, released: "2024-12", share: 0.3,
    desc: "14B small language model that punches far above its weight on math and reasoning benchmarks." },

  // ---- NVIDIA ----
  { id: "nvidia/nemotron-super-49b", name: "Nemotron Super 49B", provider: "NVIDIA", ctx: 131072, maxOut: 16384, modality: "text", open: true, reasoning: true,
    in: 0.13, out: 0.40, latency: 146, tps: 184, released: "2025-03", share: 0.4,
    desc: "Llama-based, accuracy-tuned for agentic RAG and tool calling on single-GPU deployments." },

  // ---- Perplexity ----
  { id: "perplexity/sonar-pro", name: "Sonar Pro", provider: "Perplexity", ctx: 200000, maxOut: 8192, modality: "text", open: false, reasoning: false,
    in: 3.00, out: 15.00, latency: 288, tps: 94, released: "2025-01", share: 0.7,
    desc: "Web-grounded answers with citations built in. Search-augmented generation as an API." },

  // ---- AI21 ----
  { id: "ai21/jamba-large-1.7", name: "Jamba Large 1.7", provider: "AI21", ctx: 262144, maxOut: 8192, modality: "text", open: true, reasoning: false,
    in: 2.00, out: 8.00, latency: 174, tps: 136, released: "2025-07", share: 0.2,
    desc: "Hybrid SSM-Transformer with efficient 256K context for long-document enterprise work." },

  // ---- ByteDance ----
  { id: "bytedance/seed-oss-36b", name: "Seed-OSS 36B", provider: "ByteDance", ctx: 524288, maxOut: 32768, modality: "text", open: true, reasoning: true,
    in: 0.11, out: 0.34, latency: 149, tps: 190, released: "2025-08", share: 0.5,
    desc: "Open 36B model with a 512K native window and controllable thinking budget." },

  // ---- Baidu ----
  { id: "baidu/ernie-4.5-300b", name: "ERNIE 4.5 300B", provider: "Baidu", ctx: 131072, maxOut: 16384, modality: "text+image", open: true, reasoning: false,
    in: 0.28, out: 1.10, latency: 202, tps: 128, released: "2025-06", share: 0.3,
    desc: "Baidu's open multimodal MoE with strong Chinese-language knowledge and document understanding." },

  // ---- Liquid ----
  { id: "liquid/lfm2-8b", name: "LFM2 8B", provider: "Liquid AI", ctx: 32768, maxOut: 8192, modality: "text", open: true, reasoning: false,
    in: 0.03, out: 0.08, latency: 74, tps: 288, released: "2025-10", share: 0.2, new: true,
    desc: "Liquid foundation model designed for on-device and edge inference — the cheapest tokens on the axis." },
];

// Hosts that serve open-weight models (used to synthesize per-model endpoint tables).
window.MX_HOSTS = ["Together", "DeepInfra", "Fireworks", "Groq", "Novita", "SambaNova", "Cerebras", "Hyperbolic", "Nebius", "Parasail"];

window.MX_FMT = {
  price(v) { return "$" + (v < 0.10 ? v.toFixed(3).replace(/0$/, "") : v.toFixed(2)); },
  ctx(v) {
    if (v >= 1000000) {
      const m = v / 1000000;
      return (m >= 10 ? Math.round(m) : Math.round(m * 10) / 10).toString().replace(/\.0$/, "") + "M";
    }
    return Math.round(v / 1000) + "K";
  },
  hash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; },
};
