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

export async function listMarkets(): Promise<void> {
  const client = createNosanaClient("mainnet", { api: { apiKey: getApiKey() } });
  const markets = await client.api.markets.list();
  const arr = Array.isArray(markets) ? markets : (markets as { markets?: unknown[] }).markets ?? [];

  process.stderr.write(`[qwen-nosana] Available Nosana markets (${arr.length}):\n\n`);
  for (const m of arr as Array<Record<string, unknown>>) {
    process.stderr.write(`  ${String(m.address ?? m.id ?? "?")}\n`);
    if (m.name) process.stderr.write(`    name: ${m.name}\n`);
    if (m.gpu) process.stderr.write(`    gpu:  ${JSON.stringify(m.gpu)}\n`);
    process.stderr.write("\n");
  }

  process.stderr.write(
    `Pick a market with A6000-class hardware (48 GB+ VRAM) and pass it via --market <ADDRESS>.\n` +
      `Browse visually at https://deploy.nosana.com/markets\n`,
  );
}
