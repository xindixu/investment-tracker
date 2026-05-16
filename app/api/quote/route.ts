import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type QuoteResult = { symbol: string; price?: number; error?: string };

async function fetchQuote(symbol: string): Promise<QuoteResult> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!res.ok) return { symbol, error: `status ${res.status}` };
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof price !== "number") return { symbol, error: "no price" };
    return { symbol, price };
  } catch (e) {
    return { symbol, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get("symbols");
  if (!symbolsParam) return Response.json({ quotes: [] });
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const quotes = await Promise.all(symbols.map(fetchQuote));
  return Response.json({ quotes });
}
