"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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

type HoldingSortKey = "symbol" | "account" | "quantity" | "type" | "value";
type GroupSortKey = "symbol" | "quantity" | "type" | "value" | "percent";
type SortDir = "asc" | "desc";

const compare = (a: string | number | undefined, b: string | number | undefined) => {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a < b ? -1 : 1;
};

function parseBackup(data: unknown): { accounts: Account[]; investments: Investment[] } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { accounts?: unknown; investments?: unknown };
  if (!Array.isArray(d.accounts) || !Array.isArray(d.investments)) return null;

  const accounts: Account[] = [];
  for (const a of d.accounts) {
    if (!a || typeof a !== "object") return null;
    const x = a as Partial<Account>;
    if (typeof x.id !== "string" || typeof x.name !== "string") return null;
    if (!x.type || !ACCOUNT_TYPES.includes(x.type)) return null;
    accounts.push({ id: x.id, name: x.name, type: x.type });
  }

  const investments: Investment[] = [];
  for (const i of d.investments) {
    if (!i || typeof i !== "object") return null;
    const x = i as Partial<Investment>;
    if (typeof x.id !== "string" || typeof x.symbol !== "string") return null;
    if (typeof x.accountId !== "string" || typeof x.quantity !== "number") return null;
    if (!x.type || !INVESTMENT_TYPES.includes(x.type)) return null;
    investments.push({
      id: x.id,
      symbol: x.symbol,
      accountId: x.accountId,
      quantity: x.quantity,
      type: x.type,
    });
  }

  return { accounts, investments };
}

export default function Page() {
  const [accounts, setAccounts] = useLocalStorage<Account[]>("accounts", []);
  const [investments, setInvestments] = useLocalStorage<Investment[]>("investments", []);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [symbolFilter, setSymbolFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<InvestmentType | "">("");
  const [sortKey, setSortKey] = useState<HoldingSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [groupSymbolFilter, setGroupSymbolFilter] = useState("");
  const [groupTypeFilter, setGroupTypeFilter] = useState<InvestmentType | "">("");
  const [groupBasis, setGroupBasis] = useState<"all" | "taxable">("all");
  const [groupSortKey, setGroupSortKey] = useState<GroupSortKey | null>("value");
  const [groupSortDir, setGroupSortDir] = useState<SortDir>("desc");

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

  const filteredRows = useMemo(() => {
    const q = symbolFilter.trim().toLowerCase();
    let result = rows;
    if (q) {
      result = result.filter(({ inv }) => inv.symbol.toLowerCase().includes(q));
    }
    if (accountFilter) {
      result = result.filter(({ inv }) => inv.accountId === accountFilter);
    }
    if (typeFilter) {
      result = result.filter(({ inv }) => inv.type === typeFilter);
    }
    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      const keyFn = (r: (typeof rows)[number]): string | number | undefined => {
        if (sortKey === "symbol") return r.inv.symbol;
        if (sortKey === "account") return r.account?.name ?? "";
        if (sortKey === "quantity") return r.inv.quantity;
        if (sortKey === "type") return INVESTMENT_TYPE_LABELS[r.inv.type];
        return r.value;
      };
      result = [...result].sort((a, b) => dir * compare(keyFn(a), keyFn(b)));
    }
    return result;
  }, [rows, symbolFilter, accountFilter, typeFilter, sortKey, sortDir]);

  const isFiltered = symbolFilter.trim() !== "" || accountFilter !== "" || typeFilter !== "";

  const displayedTotal = useMemo(
    () => filteredRows.reduce((s, r) => s + (r.value ?? 0), 0),
    [filteredRows]
  );

  const toggleSort = (key: HoldingSortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir("asc");
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { symbol: string; quantity: number; type: InvestmentType; value: number; hasPrice: boolean }
    >();
    for (const inv of investments) {
      if (groupBasis === "taxable" && accountById[inv.accountId]?.type !== "taxable") continue;
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
    return Array.from(map.values());
  }, [investments, prices, groupBasis, accountById]);

  const groupedTotal = useMemo(
    () => grouped.reduce((s, g) => s + (g.hasPrice ? g.value : 0), 0),
    [grouped]
  );

  const filteredGrouped = useMemo(() => {
    const q = groupSymbolFilter.trim().toLowerCase();
    let result = grouped;
    if (q) result = result.filter((g) => g.symbol.toLowerCase().includes(q));
    if (groupTypeFilter) result = result.filter((g) => g.type === groupTypeFilter);
    if (groupSortKey) {
      const dir = groupSortDir === "asc" ? 1 : -1;
      const keyFn = (g: (typeof grouped)[number]): string | number | undefined => {
        if (groupSortKey === "symbol") return g.symbol;
        if (groupSortKey === "quantity") return g.quantity;
        if (groupSortKey === "type") return INVESTMENT_TYPE_LABELS[g.type];
        return g.value;
      };
      result = [...result].sort((a, b) => dir * compare(keyFn(a), keyFn(b)));
    }
    return result;
  }, [grouped, groupSymbolFilter, groupTypeFilter, groupSortKey, groupSortDir]);

  const isGroupFiltered = groupSymbolFilter.trim() !== "" || groupTypeFilter !== "";

  const displayedGroupTotal = useMemo(
    () => filteredGrouped.reduce((s, g) => s + (g.hasPrice ? g.value : 0), 0),
    [filteredGrouped]
  );

  const toggleGroupSort = (key: GroupSortKey) => {
    if (groupSortKey !== key) {
      setGroupSortKey(key);
      setGroupSortDir("asc");
    } else if (groupSortDir === "asc") {
      setGroupSortDir("desc");
    } else {
      setGroupSortKey(null);
      setGroupSortDir("asc");
    }
  };

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

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExport = () => {
    const payload = { accounts, investments };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `investments-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseBackup(JSON.parse(text));
      if (!parsed) {
        alert("Invalid backup file: expected { accounts: [...], investments: [...] } matching the data model.");
        return;
      }
      const hasData = accounts.length > 0 || investments.length > 0;
      if (hasData && !confirm("This will replace your current accounts and investments. Continue?")) return;
      setAccounts(parsed.accounts);
      setInvestments(parsed.investments);
    } catch (e) {
      alert("Failed to import: " + (e instanceof Error ? e.message : "unknown error"));
    }
  };

  return (
    <main>
      <h1>Investment Tracker</h1>
      <div className="toolbar">
        <span className="muted">All data saved locally in your browser.</span>
        <button onClick={handleExport}>Export JSON</button>
        <button onClick={() => fileInputRef.current?.click()}>Import JSON</button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
            e.target.value = "";
          }}
        />
      </div>

      <AccountsSection accounts={accounts} onAdd={addAccount} onRemove={removeAccount} />
      <AddInvestmentSection accounts={accounts} onAdd={addInvestment} />

      <section>
        <div className="toolbar">
          <h2>Holdings</h2>
          <button onClick={refreshPrices} disabled={loadingPrices}>
            {loadingPrices ? "Refreshing…" : "Refresh prices"}
          </button>
          {isFiltered && (
            <button
              onClick={() => {
                setSymbolFilter("");
                setAccountFilter("");
                setTypeFilter("");
              }}
            >
              Clear filters
            </button>
          )}
          {priceError && <span className="error">{priceError}</span>}
        </div>
        {rows.length === 0 ? (
          <div className="empty">No investments yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <SortableTh label="Symbol" col="symbol" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}>
                  <input
                    value={symbolFilter}
                    onChange={(e) => setSymbolFilter(e.target.value)}
                    placeholder="filter"
                    style={{ width: "100%", fontSize: 12, padding: "3px 6px" }}
                  />
                </SortableTh>
                <SortableTh label="Account" col="account" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}>
                  <select
                    value={accountFilter}
                    onChange={(e) => setAccountFilter(e.target.value)}
                    style={{ width: "100%", fontSize: 12, padding: "3px 6px" }}
                  >
                    <option value="">All</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </SortableTh>
                <SortableTh label="Quantity" col="quantity" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} numeric />
                <SortableTh label="Type" col="type" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as InvestmentType | "")}
                    style={{ width: "100%", fontSize: 12, padding: "3px 6px" }}
                  >
                    <option value="">All</option>
                    {INVESTMENT_TYPES.map((t) => (
                      <option key={t} value={t}>{INVESTMENT_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </SortableTh>
                <SortableTh label="Value" col="value" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} numeric />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">No matches.</td>
                </tr>
              ) : (
                filteredRows.map(({ inv, account, value }) => (
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
                ))
              )}
              <tr>
                <td colSpan={4} style={{ fontWeight: 600 }}>
                  {isFiltered ? "Filtered total" : "Total"}
                </td>
                <td className="num" style={{ fontWeight: 600 }}>{fmtMoney(displayedTotal)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <section>
        <div className="toolbar">
          <h2>By Symbol</h2>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555" }}>
            % basis:
            <select
              value={groupBasis}
              onChange={(e) => setGroupBasis(e.target.value as "all" | "taxable")}
            >
              <option value="all">All</option>
              <option value="taxable">All taxable accounts</option>
            </select>
          </label>
          {isGroupFiltered && (
            <button
              onClick={() => {
                setGroupSymbolFilter("");
                setGroupTypeFilter("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        {grouped.length === 0 ? (
          <div className="empty">No investments yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <SortableTh label="Symbol" col="symbol" sortKey={groupSortKey} sortDir={groupSortDir} onClick={toggleGroupSort}>
                  <input
                    value={groupSymbolFilter}
                    onChange={(e) => setGroupSymbolFilter(e.target.value)}
                    placeholder="filter"
                    style={{ width: "100%", fontSize: 12, padding: "3px 6px" }}
                  />
                </SortableTh>
                <SortableTh label="Quantity" col="quantity" sortKey={groupSortKey} sortDir={groupSortDir} onClick={toggleGroupSort} numeric />
                <SortableTh label="Type" col="type" sortKey={groupSortKey} sortDir={groupSortDir} onClick={toggleGroupSort}>
                  <select
                    value={groupTypeFilter}
                    onChange={(e) => setGroupTypeFilter(e.target.value as InvestmentType | "")}
                    style={{ width: "100%", fontSize: 12, padding: "3px 6px" }}
                  >
                    <option value="">All</option>
                    {INVESTMENT_TYPES.map((t) => (
                      <option key={t} value={t}>{INVESTMENT_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </SortableTh>
                <SortableTh label="Value" col="value" sortKey={groupSortKey} sortDir={groupSortDir} onClick={toggleGroupSort} numeric />
                <SortableTh label="% of Total" col="percent" sortKey={groupSortKey} sortDir={groupSortDir} onClick={toggleGroupSort} numeric />
              </tr>
            </thead>
            <tbody>
              {filteredGrouped.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">No matches.</td>
                </tr>
              ) : (
                filteredGrouped.map((g) => (
                  <tr key={g.symbol}>
                    <td>{g.symbol}</td>
                    <td className="num">{g.quantity}</td>
                    <td>{INVESTMENT_TYPE_LABELS[g.type]}</td>
                    <td className="num">{g.hasPrice ? fmtMoney(g.value) : "—"}</td>
                    <td className="num">
                      {groupedTotal > 0 && g.hasPrice ? fmtPct(g.value / groupedTotal) : "—"}
                    </td>
                  </tr>
                ))
              )}
              <tr>
                <td colSpan={3} style={{ fontWeight: 600 }}>
                  {isGroupFiltered ? "Filtered total" : "Total"}
                </td>
                <td className="num" style={{ fontWeight: 600 }}>{fmtMoney(displayedGroupTotal)}</td>
                <td className="num" style={{ fontWeight: 600 }}>
                  {groupedTotal > 0 ? fmtPct(displayedGroupTotal / groupedTotal) : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function SortableTh<K extends string>({
  label,
  col,
  sortKey,
  sortDir,
  onClick,
  numeric,
  children,
}: {
  label: string;
  col: K;
  sortKey: K | null;
  sortDir: SortDir;
  onClick: (col: K) => void;
  numeric?: boolean;
  children?: React.ReactNode;
}) {
  const active = sortKey === col;
  const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th className={numeric ? "num" : undefined} style={{ verticalAlign: "top" }}>
      <div
        onClick={() => onClick(col)}
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        {label}
        <span style={{ color: "#888" }}>{arrow}</span>
      </div>
      {children && (
        <div
          style={{ marginTop: 4, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </th>
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
