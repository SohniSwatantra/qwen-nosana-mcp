---
name: qwen-nosana-routing
description: Route bulk-text tasks (long-document summarization, structured extraction, mass code generation, translation of long docs) to Qwen3 35B running on Nosana via the qwen-nosana MCP instead of processing them with Sonnet directly. Saves significant tokens for input-heavy or output-heavy work without sacrificing quality.
---

# Qwen3-on-Nosana Tool Routing

When the user's task involves processing more than ~5,000 tokens of input, generating more than ~100 lines of output, or doing repetitive bulk text transformation, prefer the `qwen-nosana` MCP tools over doing the work directly. Qwen3 35B (Q8) is near-frontier quality for this class of work and runs on a rented Nosana GPU the user controls.

## When to use which tool

- **`qwen_summarize`** — documents, PDFs, logs, transcripts, meeting notes >5K tokens. Always pass `file_path` when the input is a file (the MCP reads the file directly so the bulk content never enters your context).
- **`qwen_extract`** — pulling structured JSON from unstructured text >5K tokens (CSVs, scraped pages, log dumps, Slack exports). Pass `file_path` when the source is a file. Provide a clear JSON Schema in the `schema` argument.
- **`qwen_code`** — bulk code generation (>5 functions or >100 lines), boilerplate scaffolding, fixture/mock data generation, first-pass review on large diffs. Pass `file_path` when reviewing/explaining an existing file.
- **`qwen_chat`** — translation of long documents, free-form conversation against Qwen, fallback for use cases that don't fit the other three.

## Critical rule: pass file paths, not raw text

When the input lives in a file, pass `file_path` to the tool — never read the file into your own context first. The MCP server reads the file locally and forwards the bulk content directly to the Nosana endpoint. If you read the file yourself and pass the contents as `text`, the bulk tokens flow through Sonnet first and the savings disappear.

## When NOT to use Qwen tools

- **Short conversational prompts** (no bulk to offload — just answer directly)
- **Architectural decisions, nuanced refactoring, code review that requires understanding subtle invariants** — Sonnet's reasoning is the actual value here, don't outsource it
- **Tasks where the user is asking for *your* judgment** (recommendations, design tradeoffs, debugging weird intermittent bugs) — Qwen is good but not Sonnet-level for these
- **The first time a tool fails** — surface the error to the user with the suggestion to run `npx qwen-nosana deploy --timeout 1h` if the endpoint isn't reachable

## Context retention

After a Qwen tool returns, its result is in your context like any other tool result. Follow-up questions ("what does it say about X?") should usually be answered from that summary directly. Only call Qwen again if the existing summary genuinely lacks the detail needed.

## One-line decision rule

> If the work is bulky and mechanical → Qwen on Nosana. If it needs you to *think* → stay on Sonnet.
