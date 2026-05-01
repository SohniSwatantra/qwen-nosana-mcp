import { createNosanaClient } from "@nosana/kit";

function getApiKey(): string {
  const key = process.env.NOSANA_API_KEY?.trim();
  if (!key) {
    throw new Error(
      `NOSANA_API_KEY env var not set. Get one at https://deploy.nosana.com → Account → API Keys.`,
    );
  }
  return key;
}

interface MarketRow {
  address: string;
  name: string;
  gpu_types?: string[];
  usd_reward_per_hour?: unknown;
  lowest_vram?: number;
  type?: string;
}

function priceUsd(m: MarketRow): number {
  const v = m.usd_reward_per_hour;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : Infinity;
  }
  return Infinity;
}

export async function listMarkets(): Promise<void> {
  const client = createNosanaClient("mainnet", { api: { apiKey: getApiKey() } });
  const list = (await client.api.markets.list()) as unknown as MarketRow[];

  // Highlight 48 GB+ markets relevant for Qwen3 30B-A3B Q8.
  const compatible = list.filter(
    (m) => (m.lowest_vram ?? 0) >= 42 || /pro\s*6000|a6000|l40|a100|h100/i.test(m.name),
  );
  const others = list.filter((m) => !compatible.includes(m));

  process.stderr.write(
    `[qwen-nosana] ${list.length} markets total, ${compatible.length} compatible with Qwen3 30B-A3B Q8 (need ≥42 GB VRAM).\n\n`,
  );
  process.stderr.write(`COMPATIBLE MARKETS (sorted by price):\n\n`);

  compatible.sort((a, b) => priceUsd(a) - priceUsd(b));
  for (const m of compatible) {
    const price = priceUsd(m);
    const priceStr = Number.isFinite(price) ? `$${price.toFixed(2)}/hr` : "(price unknown)";
    process.stderr.write(`  ${m.name}\n`);
    process.stderr.write(`    address: ${m.address}\n`);
    process.stderr.write(`    price:   ${priceStr}\n`);
    if (m.gpu_types?.length) process.stderr.write(`    gpus:    ${m.gpu_types.join(", ")}\n`);
    if (m.lowest_vram) process.stderr.write(`    vram:    ${m.lowest_vram} GB\n`);
    if (m.type) process.stderr.write(`    type:    ${m.type}\n`);
    process.stderr.write("\n");
  }

  if (others.length > 0) {
    process.stderr.write(`(${others.length} other markets omitted — too small for Qwen3 30B-A3B Q8)\n\n`);
  }

  process.stderr.write(
    `Recommended: any "NVIDIA Pro 6000" market (96 GB, ~$1/hr — best value for Q8).\n` +
      `'qwen-nosana deploy' auto-selects Pro 6000 SOC2 if you don't pass --market.\n` +
      `Browse visually at https://deploy.nosana.com/markets\n`,
  );
}
