// Data model. Everything here is stored; anything derived (balances, totals, who owes
// who, forecasts) is computed on load and never written.

export const SCHEMA_VERSION = 1;

/** Integer minor units (centavos). */
export type Minor = number;
/** "YYYY-MM-DD" */
export type IsoDate = string;
/** "YYYY-MM" */
export type MonthKey = string;
/** ISO timestamp, used for last-write-wins merges. */
export type Stamp = string;

export type EntryKind = "expense" | "income" | "settlement" | "transfer";
export type SplitMode = "they-owe" | "i-owe" | "half" | "custom";

export interface SplitShare {
  /** A person id, or "me". */
  personId: string;
  /** What this participant owes the payer, in the entry's currency. The payer has no share. */
  amount: Minor;
}

export interface Split {
  /** "me" or a person id. */
  paidBy: string;
  mode: SplitMode;
  shares: SplitShare[];
}

export interface Entry {
  id: string; // ULID
  kind: EntryKind;
  date: IsoDate;
  amount: Minor; // always positive; kind gives the direction
  currency: string; // default "PHP"
  /** Decimal string: base-currency units per 1 unit of `currency`. Absent when currency is the base. */
  rate?: string;
  category?: string;
  note?: string;
  /** The account the money moved in. For a transfer, the account it left. */
  accountId?: string;
  /** Transfers only: the account the money went to (for example paying a card from the bank). */
  toAccountId?: string;
  /** Income only: money back for an expense. It lowers spending in its category instead of counting as income. */
  refund?: true;
  /** Refunds: the id of the expense being refunded. */
  refundOf?: string;
  /** Set when generated or overridden from a rule. */
  ruleId?: string;
  split?: Split;
  /** Settlement entries: the person paid to or received from. */
  personId?: string;
  /** Settlement entries: "in" = they paid me, "out" = I paid them. */
  direction?: "in" | "out";
  createdAt: Stamp;
  updatedAt: Stamp;
  /** Tombstone, so deletes survive merges. */
  deleted?: true;
}

export interface MonthFile {
  month: MonthKey;
  entries: Entry[];
}

export type Frequency = "weekly" | "monthly" | "yearly";

/** A change that applies to a rule's payments from `from` onward (a price change, a new note). */
export interface RuleRevision {
  from: IsoDate;
  amount?: Minor;
  note?: string;
  category?: string;
  accountId?: string;
}

export interface Rule {
  id: string;
  type: "recurring" | "installment" | "income";
  kind: EntryKind;
  amount: Minor;
  currency: string;
  category?: string;
  note?: string;
  accountId?: string;
  frequency: Frequency;
  start: IsoDate;
  end?: IsoDate;
  /** Installments only: number of payments and the total, split with splitEvenly. */
  count?: number;
  total?: Minor;
  split?: Split;
  /** Dates of occurrences that are skipped. */
  skipped?: IsoDate[];
  /** Changes from a date onward, oldest first. Ignored for installments. */
  revisions?: RuleRevision[];
  /** Per-occurrence overrides keyed by occurrence date. */
  overrides?: Record<IsoDate, { amount?: Minor; note?: string }>;
  updatedAt: Stamp;
  deleted?: true;
}

export interface Person {
  id: string;
  name: string;
  updatedAt: Stamp;
  deleted?: true;
}

export interface Account {
  id: string;
  name: string;
  currency: string;
  /** Cash at the start. For a card this is negative: what was owed when it was added. */
  openingBalance: Minor;
  /** Foreign accounts only: base-currency units per 1 unit of the account currency. */
  rate?: string;
  /** Absent means "bank", so accounts made before cards existed stay bank accounts. */
  type?: "bank" | "card";
  /** Cards: day of the month the statement closes (29 to 31 clamp to the month end). */
  statementDay?: number;
  /** Cards: days from the cut-off to the due date. Default DEFAULT_DUE_DAYS. */
  dueDays?: number;
  /** Cards: credit limit. */
  limit?: Minor;
  /** Cards: a statement's due date moved by hand (weekends, holidays), keyed by its cut-off date. */
  dueOverrides?: Record<IsoDate, IsoDate>;
  updatedAt: Stamp;
  deleted?: true;
}

export interface Settings {
  schemaVersion: number;
  baseCurrency: string;
  defaultCurrency: string;
  categories: string[];
}

export interface Manifest {
  revision: number;
  updatedBy: string;
  updatedAt: Stamp;
  /** path -> SHA-256 hex of the file bytes */
  checksums: Record<string, string>;
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SCHEMA_VERSION,
  baseCurrency: "PHP",
  defaultCurrency: "PHP",
  categories: ["Food", "Transport", "Rent", "Bills", "Shopping", "Health", "Fun", "Other"],
};

export const DEFAULT_DUE_DAYS = 25;

export const isCard = (a: Pick<Account, "type">) => a.type === "card";

export const monthOf = (d: IsoDate): MonthKey => d.slice(0, 7);
