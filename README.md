# qwen-nosana-mcp

> Private, self-hosted **Qwen3 35B** for your **Claude Code** or **Codex CLI** agent. Your prompts and data never leave the decentralized GPU you rented — no Alibaba API key, no TOS-based content filtering, no rate limits, no per-token billing.

![Architecture](docs/architecture.png)

`qwen-nosana-mcp` is an open-source MCP server + companion CLI that lets your agent offload bulk-text work (long-document summarization, structured extraction, mass code generation, translation of long docs) to a **Qwen3 35B Q8_0** instance running on a **Nosana** A6000 GPU. The frontier model (Sonnet 4.6 / GPT-5) stays the smart conductor; Qwen3 becomes the cheap muscle.

---

## Quick install

**Claude Code:**

```bash
claude mcp add qwen-nosana -- npx -y qwen-nosana-mcp
npx qwen-nosana setup            # installs the routing skill into ~/.claude/skills/
npx qwen-nosana deploy --timeout 1h
```

**Codex CLI:**

```bash
codex mcp add qwen-nosana -- npx -y qwen-nosana-mcp
npx qwen-nosana setup            # prints a recommended block for ~/.codex/AGENTS.md
npx qwen-nosana deploy --timeout 1h
```

That's it. Use Claude Code or Codex normally — bulky tasks automatically route through Qwen3 on your Nosana GPU. Run `npx qwen-nosana stop` when you're done to terminate the GPU early.

> **One-time prerequisite:** install `@nosana/cli` and create a wallet funded with NOS tokens.
> ```bash
> npm install -g @nosana/cli
> nosana wallet create
> # fund via https://docs.nosana.io
> ```

---

## What you can do with it (try these prompts)

After `setup` + `deploy`, type any of these into Claude Code or Codex:

1. **"Summarize this 600-page contract: contract.pdf"** → routes to `qwen_summarize`. Sonnet sees a 2K summary instead of 300K tokens of contract.
2. **"Extract every email + company from this Slack export.json"** → routes to `qwen_extract` with a JSON Schema.
3. **"Generate 100 unit tests for `parseInvoice()` in src/invoice.ts and write them to `__tests__/`"** → routes to `qwen_code` (task=generate); Claude Code writes the file.
4. **"Translate this 30-page docs site (./docs) from English to German"** → loop of `qwen_chat` calls.
5. **"Review this 2000-line PR diff for SQL-injection issues"** → `qwen_code` with task=review.
6. **"Generate 5,000 rows of realistic synthetic user data as JSONL"** → `qwen_chat`.

---

## How it saves you tokens

The MCP exposes 4 tools to your agent. The agent (Sonnet / GPT-5) decides which to call based on the routing skill installed by `setup`:

| Tool | When the agent calls it |
|---|---|
| `qwen_summarize` | Documents / PDFs / logs / transcripts >5K tokens |
| `qwen_extract` | Structured JSON extraction from messy text |
| `qwen_code` | Bulk code gen / first-pass review / mass fixtures |
| `qwen_chat` | Translation, free-form, fallback |

### Worked example: a 600-page PDF (~300K tokens)

| Step | Without MCP | With MCP (`file_path` pattern) |
|---|---|---|
| Read PDF | Sonnet reads 300K tokens into its context | MCP reads file directly — Sonnet never sees it |
| Process | Sonnet: 300K input + 2K output | Qwen on Nosana: 300K → 2K summary |
| **Sonnet sees** | 300K + 2K | **~50 tok (tool call) + ~2K (result)** |
| **Sonnet cost (Sonnet 4.6 rates)** | ~$0.93 | **~$0.04** |
| Plus | — | Amortized share of $1.50–$3 / hr A6000 |

→ **~20× less Sonnet usage** for that class of work. The Nosana hour amortizes — push more bulk through it, the per-call cost drops further.

### The critical design rule: tools accept `file_path`, not raw text

Every tool exposes both `file_path` and `text` inputs. **Always pass `file_path` when the input lives in a file.** The MCP reads the file locally and forwards the bulk content to Nosana directly. If you pass the contents as `text`, the bulk tokens flow through Sonnet first and the savings disappear. The installed skill teaches the agent this rule automatically.

---

## Why this MCP exists (it's not about cheaper inference)

**Honest comparison vs. Qwen's own API:** roughly a wash. Qwen3 30B-A3B on Alibaba's API is $0.08/M input + $0.28/M output. For typical single-user usage (~100 tok/sec), API ≈ $0.13/hour vs. ~$1.50–$3/hour on Nosana — the API is often *cheaper*. So that's not the reason to use this. The actual reasons:

1. **Privacy / data sovereignty** *(the primary one)*. Your prompts and data never touch Alibaba's servers (China residency). No vendor TOS to worry about. Critical for EU / GDPR / legal / healthcare / regulated-industry users.
2. **No account, no KYC.** Pay with NOS / crypto. No Alibaba account or payment method on file.
3. **No rate limits.** For that hour, the GPU is *yours*, not shared with other API tenants.
4. **No vendor lock-in.** The MCP talks to any OpenAI-compatible Ollama endpoint via `NOSANA_OLLAMA_URL`. Point it at vLLM, llama.cpp, or your own server and the same MCP keeps working.
5. **Decentralization.** Nosana's GPU grid is community-run.

**Where there is a real cost win:** when your agent would otherwise burn frontier-model tokens on bulk offloadable work. An hour of bulk summarization / extraction that costs ~$30–$45 on Sonnet 4.6 (or ~$32 on GPT-5) costs ~$1.50–$5 on Qwen3 + Nosana, depending on which 48 GB+ GPU your job lands on.

---

## How a Nosana deployment actually works (read this once)

A Nosana job is **not** "submit per request". It's **deploy a container that stays running, use it as much as you want during that window**.

| Step | Frequency | Cost |
|---|---|---|
| `npx qwen-nosana deploy --timeout 1h` | **Once per work session** | Cold start 1–3 min. ~$1.50–$3 / hour reserved. |
| Every prompt that triggers a Qwen tool | **Sub-second** | $0 marginal — you've already paid for the hour. |
| `npx qwen-nosana stop` | **When done** | Terminates billing. |

**Always pass `--timeout`.** Without it, a forgotten container can run overnight and produce a surprise tens-of-dollars bill.

### GPU class: A6000 preferred, falls back automatically

The bundled `nosana/qwen3-job.json` declares `required_vram: 42`, which qualifies:

- **NVIDIA RTX A6000 (48 GB)** — preferred, ~$1.50/hr
- **L40 / L40S (48 GB)** — common fallback, ~$1.50–$2.50/hr
- **A100 80 GB** / **H100 80 GB** — rarer, ~$3–$5/hr

It excludes RTX 3090, 4090, and 5090 because Q8_0 of Qwen3 35B-A3B needs ~36–40 GB working set (weights + KV cache). A6000 is the cost/quality sweet spot; the scheduler picks whatever's available at deploy time.

---

## Tools reference

| Tool | Required inputs | Optional inputs |
|---|---|---|
| `qwen_chat` | `messages[]` | `temperature`, `max_tokens` |
| `qwen_summarize` | `file_path` *or* `text` | `style` (bullet/paragraph/tldr), `focus`, `max_words` |
| `qwen_extract` | `schema` (JSON Schema), and `file_path` *or* `text` | `instruction` |
| `qwen_code` | `task` (generate/explain/review), `language` | `file_path` *or* `code`, `instructions` |

If both `file_path` and `text` are supplied, `file_path` wins.

---

## What this MCP does NOT do (honest expectations)

- ❌ Qwen running on Nosana has **no autonomous tool access** — no web search, no shell, no file system. It's a text-in/text-out completion server. Tool use lives in Claude Code / Codex (the orchestrator).
- ❌ Does **not** auto-deploy on first MCP call. Deploy is a deliberate, visible step (`qwen-nosana deploy`) so you control when GPU spending starts and stops.
- ❌ Does **not** silently edit your `CLAUDE.md` or `AGENTS.md`. Routing guidance ships as a Claude Code Skill (installed via `setup`) for clean install/uninstall.
- ❌ Does **not** auto-renew expired jobs in v0.1. If your job expires, run `deploy` again. Watch mode is on the v0.2 roadmap.

---

## Security & trust

- **Wallet keys never leave Nosana CLI.** This package shells out to `nosana job post` — it never reads or transmits your `~/.nosana/nosana_key.json`.
- **No telemetry.** The package makes outbound HTTPS calls only to your Nosana endpoint and (during `deploy`) to the Nosana network via the official CLI.
- **MIT licensed**, source-available. Audit before installing if you're security-conscious.

---

## CLI reference

```
qwen-nosana setup [--yes] [--remove]    Install/uninstall the Claude Code Skill.
                                         Prints recommended Codex AGENTS.md block.
qwen-nosana deploy --timeout <DUR>      Deploy Qwen3 35B Q8 to Nosana.
                                         DUR examples: 1h, 30m, 3600
                  [--market <NAME>]      Pin to a specific Nosana market.
qwen-nosana stop                         Stop the active deployment.
qwen-nosana status                       Show current deployment + time remaining.
qwen-nosana help                         Show help.
```

---

## Roadmap (v0.2+)

1. **`watch` mode** — `npx qwen-nosana watch --max-cost-per-day 10` keeps a job alive across expirations with a cost cap.
2. **Agent-on-Nosana mode** — wrap an agent runtime (Aider / Goose / OpenHands) in the same container so Claude Code can offload entire multi-step tasks via `qwen_agent_run(task, repo)`.
3. **Streaming responses** through MCP stdio.
4. **Status / observability** — request count, GPU type the job landed on, latency histograms.

PRs welcome.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Sources

- Qwen3 30B-A3B API pricing: https://pricepertoken.com/pricing-page/model/qwen-qwen3-30b-a3b
- Nosana GPU markets: https://explore.nosana.com/markets/
- Spheron 2026 GPU/LLM cost benchmark: https://www.spheron.network/blog/gpu-cost-per-token-benchmark-llm-inference-2026/
