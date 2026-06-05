export type AccountType = "taxable" | "401k" | "roth" | "bank";
export type InvestmentType = "ETF" | "stock" | "mutual_fund";

export const ACCOUNT_TYPES: AccountType[] = ["taxable", "401k", "roth", "bank"];
export const INVESTMENT_TYPES: InvestmentType[] = ["ETF", "stock", "mutual_fund"];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  taxable: "Taxable",
  "401k": "401K",
  roth: "ROTH",
  bank: "Bank",
};

export const INVESTMENT_TYPE_LABELS: Record<InvestmentType, string> = {
  ETF: "ETF",
  stock: "Stock",
  mutual_fund: "Mutual Fund",
};

export interface Account {
  id: string;
  name: string;
  type: AccountType;
}

export interface Investment {
  id: string;
  symbol: string;
  accountId: string;
  quantity: number;
  type: InvestmentType;
  planned?: boolean;
}

export interface CashEntry {
  id: string;
  label: string;
  amount: number;
  planned?: boolean;
}
