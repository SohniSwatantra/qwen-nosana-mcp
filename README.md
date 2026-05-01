# qwen-nosana-mcp

> Private, self-hosted **Qwen3 30B-A3B** for your **Claude Code** or **Codex CLI** agent. Your prompts and data never leave the decentralized GPU you rented — no Alibaba API key, no TOS-based content filtering, no rate limits, no per-token billing.

<img width="2416" height="1038" alt="image" src="https://github.com/user-attachments/assets/ca05a8c7-b9c0-4f2b-9bcd-c9cfa70836c6" />


`qwen-nosana-mcp` is an open-source MCP server + companion CLI that lets your agent offload bulk-text work (long-document summarization, structured extraction, mass code generation, translation of long docs) to a **Qwen3 30B-A3B Q8_0** instance running on a **Nosana NVIDIA Pro 6000 Blackwell** GPU at ~$1/hour. The frontier model (Sonnet 4.6 / GPT-5) stays the smart conductor; Qwen3 becomes the cheap muscle.

**Built-in safety:** every deploy is cost-bounded by default — 60-min timeout (~$1 max), 5-min idle auto-stop, hard-cap at 4 hours. You can't accidentally leave a GPU running and burn credits.

---

## Quick install

### One-time setup — get a Nosana API key 

1. Sign in at **https://deploy.nosana.com**
2. **Account → API Keys → Create Key** (give it a name, set an expiration)
3. Copy the key (`nos_xxx_...`) and add to your shell profile:
   ```bash
   export NOSANA_API_KEY=nos_xxx_your_key
   ```
4. Reload your shell. **That's it.** Deployments are paid for with the credit balance on your Nosana account — top up at https://deploy.nosana.com/account if needed. You do NOT need to buy NOS tokens or run `nosana wallet create`.

### Install the MCP (3 commands)

**Claude Code:**

```bash
claude mcp add qwen-nosana -e NOSANA_API_KEY=$NOSANA_API_KEY -- npx -y qwen-nosana-mcp
npx qwen-nosana setup            # installs the routing skill into ~/.claude/skills/
npx qwen-nosana deploy           # auto-picks Pro 6000 SOC2, 60-min timeout (~$1 max)
```

**Codex CLI:**

```bash
codex mcp add qwen-nosana --env NOSANA_API_KEY=$NOSANA_API_KEY -- npx -y qwen-nosana-mcp
npx qwen-nosana setup            # prints a recommended block for ~/.codex/AGENTS.md
npx qwen-nosana deploy
```

That's it. Use Claude Code or Codex normally — bulky tasks automatically route through Qwen3 on your Nosana GPU. Run `npx qwen-nosana stop` to terminate the GPU early; otherwise the MCP auto-stops after 5 min of idle to protect your credits.

> **Want to pick a different GPU?** Run `npx qwen-nosana markets` to list all options with prices, then `npx qwen-nosana deploy --market <ADDRESS>`.

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
| Plus | — | Amortized share of ~$1 / hr Pro 6000 Blackwell |

→ **~20× less Sonnet usage** for that class of work. The Nosana hour amortizes — push more bulk through it, the per-call cost drops further.

### The critical design rule: tools accept `file_path`, not raw text

Every tool exposes both `file_path` and `text` inputs. **Always pass `file_path` when the input lives in a file.** The MCP reads the file locally and forwards the bulk content to Nosana directly. If you pass the contents as `text`, the bulk tokens flow through Sonnet first and the savings disappear. The installed skill teaches the agent this rule automatically.

---

## Why this MCP exists (it's not about cheaper inference)

**Honest comparison vs. Qwen's own API:** roughly a wash. Qwen3 30B-A3B on Alibaba's API is $0.08/M input + $0.28/M output. For typical single-user usage (~100 tok/sec), API ≈ $0.13/hour vs. ~$1/hour on Nosana Pro 6000 — the API is often *cheaper*. So that's not the reason to use this. The actual reasons:

1. **Privacy / data sovereignty** *(the primary one)*. Your prompts and data never touch Alibaba's servers (China residency). No vendor TOS to worry about. Critical for EU / GDPR / legal / healthcare / regulated-industry users.
2. **No Alibaba account.** No third-party API key on file with a foreign cloud provider — just credits on your Nosana account.
3. **No rate limits.** For the duration of your deployment, the GPU is *yours*, not shared with other API tenants.
4. **No vendor lock-in.** The MCP is a thin proxy over any OpenAI-compatible Ollama endpoint. Point it at vLLM, llama.cpp, or your own server (via the optional `NOSANA_OLLAMA_URL` override) and the same MCP keeps working.
5. **Decentralization.** Nosana's GPU grid is community-run.

**Where there is a real cost win:** when your agent would otherwise burn frontier-model tokens on bulk offloadable work. An hour of bulk summarization / extraction that costs ~$30–$45 on Sonnet 4.6 (or ~$32 on GPT-5) costs ~$1 on Qwen3 + Pro 6000 Blackwell. Roughly **30–45× cheaper** for offloadable work.

---

## How a Nosana deployment actually works (read this once)

A Nosana job is **not** "submit per request". It's **deploy a container that stays running, use it as much as you want during that window**.

| Step | Frequency | Cost |
|---|---|---|
| `npx qwen-nosana deploy` | **Once per work session** | Cold start 1–3 min (sometimes 8–15 min if model is fresh on the host). ~$1/hr on Pro 6000 Blackwell. |
| Every prompt that triggers a Qwen tool | **Sub-second** | $0 marginal — you've already paid for the hour. |
| `npx qwen-nosana stop` *(or 5 min idle, or 60-min timeout, whichever comes first)* | **Automatic** | Terminates billing, returns unused credit time. |

### Built-in credit-safety (no flags needed)

Three independent layers protect you from a runaway GPU bill:

1. **Default 60-min timeout** if you don't pass `--timeout`. Worst case: ~$1 per accidental deploy.
2. **5-min idle auto-stop** in the MCP server. If you stop using Qwen tools, the GPU stops itself, even if your Claude Code is still open. Override via `QWEN_IDLE_TIMEOUT_MIN` env var (set to `0` to disable).
3. **240-min hard cap** on `--timeout` unless you explicitly pass `--allow-long-deploy`. Prevents fat-finger 7-day reservations.

So the **maximum accidental spend is ~$4** (240 min × ~$1/hr), and only if you've explicitly typed `--allow-long-deploy`.

### GPU class: Pro 6000 preferred, fallback to A6000

The bundled `nosana/qwen3-job.json` declares `required_vram: 42`, which qualifies:

- **NVIDIA Pro 6000 Blackwell (96 GB)** — preferred, ~$1/hr ✨ best value for Q8
- **NVIDIA RTX A6000 (48 GB)** — fallback, ~$1.50/hr
- **L40 / L40S (48 GB)** — common fallback, ~$1.50–$2.50/hr
- **A100 80 GB** / **H100 80 GB** — rarer, ~$3–$5/hr

`qwen-nosana deploy` auto-selects the Pro 6000 SOC2 market if you don't pass `--market`. RTX 3090, 4090, and 5090 are excluded because Q8_0 of Qwen3 30B-A3B needs ~36 GB working set (weights + KV cache).

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

- **API key stays in your environment.** This package reads `NOSANA_API_KEY` from your env, uses it via the official `@nosana/kit` SDK to call `https://dashboard.k8s.prd.nos.ci/api`. The key is never written to disk by this package and never transmitted anywhere except Nosana's own API.
- **No NOS tokens, no Solana wallet.** Deployments are funded by credits on your Nosana account (paid via fiat), not on-chain tokens.
- **No telemetry.** The package makes outbound HTTPS calls only to (a) your Nosana deployment's Ollama endpoint and (b) Nosana's API for deploy/stop/status.
- **MIT licensed**, source-available. Audit before installing if you're security-conscious.

---

## CLI reference

```
qwen-nosana setup [--yes] [--remove]    Install/uninstall the Claude Code Skill.
                                         Prints recommended Codex AGENTS.md block.
                                         Verifies NOSANA_API_KEY is set.
qwen-nosana markets                      List Nosana GPU markets compatible with Qwen3 30B-A3B Q8.
qwen-nosana deploy                       Deploy Qwen3 30B-A3B Q8 to Nosana.
                  [--timeout <MIN>]      Default 60 min. Hard-capped at 240 unless --allow-long-deploy.
                  [--market <ADDRESS>]   Default: auto-detect Pro 6000 SOC2.
                  [--name <NAME>]        Optional friendly deployment name.
                  [--allow-long-deploy]  Bypass the 240-min safety cap.
qwen-nosana stop                         Stop the active deployment early.
qwen-nosana status                       Show current deployment + time remaining.
qwen-nosana help                         Show help.
```

All commands except `setup` and `help` require `NOSANA_API_KEY` to be set in your environment.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `NOSANA_API_KEY` | (required) | Auth for Nosana API. Get from https://deploy.nosana.com → Account → API Keys. |
| `QWEN_IDLE_TIMEOUT_MIN` | `5` | MCP server auto-stops the GPU after this many minutes of no tool calls. Set to `0` to disable. |
| `QWEN_MODEL` | `qwen3:30b-a3b-q8_0` | Override the model tag the MCP talks to (advanced). |
| `NOSANA_OLLAMA_URL` | (auto from `~/.qwen-nosana/current.json`) | Override the endpoint URL. Useful for pointing at vLLM / local Ollama / non-Nosana hosts. |

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
