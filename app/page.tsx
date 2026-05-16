"use client";
import { useEffect, useMemo, useState } from "react";
import { useLocalStorage } from "@/lib/storage";
import {
  Account,
  AccountType,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  Investment,
  InvestmentType,
  INVESTMENT_TYPES,
  INVESTMENT_TYPE_LABELS,
} from "@/lib/types";

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const fmtPct = (n: number) =>
  (n * 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + "%";

export default function Page() {
  const [accounts, setAccounts] = useLocalStorage<Account[]>("accounts", []);
  const [investments, setInvestments] = useLocalStorage<Investment[]>("investments", []);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  const symbols = useMemo(
    () => Array.from(new Set(investments.map((i) => i.symbol.toUpperCase()))),
    [investments]
  );
  const symbolsKey = symbols.join(",");

  const refreshPrices = async () => {
    if (symbols.length === 0) {
      setPrices({});
      return;
    }
    setLoadingPrices(true);
    setPriceError(null);
    try {
      const res = await fetch(`/api/quote?symbols=${encodeURIComponent(symbolsKey)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const next: Record<string, number> = {};
      const errors: string[] = [];
      for (const q of data.quotes ?? []) {
        if (typeof q.price === "number") next[q.symbol.toUpperCase()] = q.price;
        else errors.push(`${q.symbol}: ${q.error ?? "no price"}`);
      }
      setPrices(next);
      if (errors.length > 0) setPriceError(errors.join("; "));
    } catch (e) {
      setPriceError(e instanceof Error ? e.message : "Failed to load prices");
    } finally {
      setLoadingPrices(false);
    }
  };

  useEffect(() => {
    refreshPrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  const accountById = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a])),
    [accounts]
  );

  const rows = useMemo(
    () =>
      investments.map((inv) => {
        const price = prices[inv.symbol.toUpperCase()];
        const value = typeof price === "number" ? price * inv.quantity : undefined;
        return { inv, account: accountById[inv.accountId] as Account | undefined, value };
      }),
    [investments, prices, accountById]
  );

  const totalValue = useMemo(
    () => rows.reduce((s, r) => s + (r.value ?? 0), 0),
    [rows]
  );

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { symbol: string; quantity: number; type: InvestmentType; value: number; hasPrice: boolean }
    >();
    for (const inv of investments) {
      const key = inv.symbol.toUpperCase();
      const price = prices[key];
      const partial = typeof price === "number" ? price * inv.quantity : 0;
      const existing = map.get(key);
      if (existing) {
        existing.quantity += inv.quantity;
        existing.value += partial;
        existing.hasPrice = existing.hasPrice && typeof price === "number";
      } else {
        map.set(key, {
          symbol: key,
          quantity: inv.quantity,
          type: inv.type,
          value: partial,
          hasPrice: typeof price === "number",
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [investments, prices]);

  const addAccount = (name: string, type: AccountType) => {
    if (!name.trim()) return;
    setAccounts([...accounts, { id: newId(), name: name.trim(), type }]);
  };
  const removeAccount = (id: string) => {
    const has = investments.some((i) => i.accountId === id);
    if (has && !confirm("This account has investments. Delete it and all its investments?")) return;
    setAccounts(accounts.filter((a) => a.id !== id));
    setInvestments(investments.filter((i) => i.accountId !== id));
  };

  const addInvestment = (
    symbol: string,
    accountId: string,
    quantity: number,
    type: InvestmentType
  ) => {
    if (!symbol.trim() || !accountId || !(quantity > 0)) return;
    setInvestments([
      ...investments,
      { id: newId(), symbol: symbol.trim().toUpperCase(), accountId, quantity, type },
    ]);
  };
  const removeInvestment = (id: string) => {
    setInvestments(investments.filter((i) => i.id !== id));
  };

  return (
    <main>
      <h1>Investment Tracker</h1>
      <div className="muted">All data saved locally in your browser.</div>

      <AccountsSection accounts={accounts} onAdd={addAccount} onRemove={removeAccount} />
      <AddInvestmentSection accounts={accounts} onAdd={addInvestment} />

      <section>
        <div className="toolbar">
          <h2>Holdings</h2>
          <button onClick={refreshPrices} disabled={loadingPrices}>
            {loadingPrices ? "Refreshing…" : "Refresh prices"}
          </button>
          {priceError && <span className="error">{priceError}</span>}
        </div>
        {rows.length === 0 ? (
          <div className="empty">No investments yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Account</th>
                <th className="num">Quantity</th>
                <th>Type</th>
                <th className="num">Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ inv, account, value }) => (
                <tr key={inv.id}>
                  <td>{inv.symbol}</td>
                  <td>{account ? account.name : <span className="muted">unknown</span>}</td>
                  <td className="num">{inv.quantity}</td>
                  <td>{INVESTMENT_TYPE_LABELS[inv.type]}</td>
                  <td className="num">{value === undefined ? "—" : fmtMoney(value)}</td>
                  <td>
                    <button className="danger" onClick={() => removeInvestment(inv.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} style={{ fontWeight: 600 }}>Total</td>
                <td className="num" style={{ fontWeight: 600 }}>{fmtMoney(totalValue)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>By Symbol</h2>
        {grouped.length === 0 ? (
          <div className="empty">No investments yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="num">Quantity</th>
                <th>Type</th>
                <th className="num">Value</th>
                <th className="num">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => (
                <tr key={g.symbol}>
                  <td>{g.symbol}</td>
                  <td className="num">{g.quantity}</td>
                  <td>{INVESTMENT_TYPE_LABELS[g.type]}</td>
                  <td className="num">{g.hasPrice ? fmtMoney(g.value) : "—"}</td>
                  <td className="num">
                    {totalValue > 0 && g.hasPrice ? fmtPct(g.value / totalValue) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function AccountsSection({
  accounts,
  onAdd,
  onRemove,
}: {
  accounts: Account[];
  onAdd: (name: string, type: AccountType) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("taxable");

  return (
    <section>
      <h2>Accounts</h2>
      <div className="row">
        <label className="field">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fidelity Brokerage"
          />
        </label>
        <label className="field">
          Type
          <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>
        <button
          className="primary"
          onClick={() => {
            onAdd(name, type);
            setName("");
          }}
        >
          Add account
        </button>
      </div>
      {accounts.length === 0 ? (
        <div className="empty">No accounts yet.</div>
      ) : (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{ACCOUNT_TYPE_LABELS[a.type]}</td>
                <td>
                  <button className="danger" onClick={() => onRemove(a.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function AddInvestmentSection({
  accounts,
  onAdd,
}: {
  accounts: Account[];
  onAdd: (symbol: string, accountId: string, quantity: number, type: InvestmentType) => void;
}) {
  const [symbol, setSymbol] = useState("");
  const [accountId, setAccountId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [type, setType] = useState<InvestmentType>("ETF");

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
    if (accountId && !accounts.some((a) => a.id === accountId)) {
      setAccountId(accounts[0]?.id ?? "");
    }
  }, [accounts, accountId]);

  return (
    <section>
      <h2>Add Investment</h2>
      {accounts.length === 0 ? (
        <div className="empty">Add an account first.</div>
      ) : (
        <div className="row">
          <label className="field">
            Symbol
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="VOO"
              style={{ textTransform: "uppercase" }}
            />
          </label>
          <label className="field">
            Account
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Quantity
            <input
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="10"
            />
          </label>
          <label className="field">
            Type
            <select value={type} onChange={(e) => setType(e.target.value as InvestmentType)}>
              {INVESTMENT_TYPES.map((t) => (
                <option key={t} value={t}>{INVESTMENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </label>
          <button
            className="primary"
            onClick={() => {
              const q = Number(quantity);
              if (!Number.isFinite(q) || q <= 0) return;
              onAdd(symbol, accountId, q, type);
              setSymbol("");
              setQuantity("");
            }}
          >
            Add
          </button>
        </div>
      )}
    </section>
  );
}
