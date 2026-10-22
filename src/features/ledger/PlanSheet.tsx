import { useState } from "react";
import { nameOf, upsert } from "../../data/collections";
import { addDays, labelDay } from "../../data/dates";
import { formatMinor } from "../../data/money";
import type { Occurrence } from "../../data/rules";
import { REMOVED_PERSON } from "../../data/splits";
import type { Person, Rule } from "../../data/schema";
import { Dock, Sheet } from "../../ui/Sheet";
import { ConfirmButton } from "../../ui/ConfirmButton";
import { confirmLabel } from "../../ui/confirm";
import { useLedger } from "../../ui/Ledger";
import { OccurrenceForm } from "./OccurrenceForm";
import { PlanEditForm } from "./PlanEditForm";

/**
 * A generated recurring or installment payment: Edit (OccurrenceForm), Edit plan (PlanEditForm: start,
 * every, payments and total or end, for the whole plan), Skip this one, End series.
 * Shared by the Ledger and the Dashboard's Recurring list. `people` should include removed ones (listAll)
 * so a split still names them.
 */
export function PlanSheet({ occ, rule, people, onClose, docked }: { occ: Occurrence; rule?: Rule; people: Person[]; onClose: () => void; docked?: boolean }) {
  // Docked: the Ledger's edit pane on wide screens.
  const Sheet_ = docked ? Dock : Sheet;
  const { store, changed } = useLedger();
  const [editing, setEditing] = useState<"payment" | "plan">();
  const personName = (id: string) => (id === "me" ? "me" : nameOf(id, people, REMOVED_PERSON));

  async function skip() {
    if (rule) await upsert(store, "rules", { ...rule, skipped: [...(rule.skipped ?? []), occ.date] });
    onClose();
    changed();
  }

  async function endSeries() {
    if (rule) await upsert(store, "rules", { ...rule, end: addDays(occ.date, -1) });
    onClose();
    changed();
  }

  if (editing) {
    if (!rule) return null;
    return editing === "plan" ? (
      <Sheet_ key="plan" locked onClose={onClose}>
        <h3>Edit plan</h3>
        <p className="mute small">{occ.note || occ.category}, {occ.type === "installment" ? "installment" : "recurring"}</p>
        <PlanEditForm rule={rule} onDone={onClose} />
      </Sheet_>
    ) : (
      <Sheet_ key="edit" locked onClose={onClose}>
        <h3>Edit payment</h3>
        <OccurrenceForm occ={occ} rule={rule} onDone={onClose} />
      </Sheet_>
    );
  }

  return (
    <Sheet_ locked onClose={onClose}>
      <h3>{occ.note || occ.category}</h3>
      <p className="mute">
        {labelDay(occ.date)} · {formatMinor(occ.amount, occ.currency)}
        {occ.type === "installment" && ` · ${occ.index} of ${occ.count} · ${formatMinor(occ.remainingAfter ?? 0, occ.currency)} left after`}
      </p>
      {occ.split && <p className="mute small">Split with {occ.split.shares.map((s) => personName(s.personId)).join(", ")}</p>}
      <div className="actions wrap">
        <button className="btn" onClick={() => setEditing("payment")}>Edit</button>
        <button className="btn ghost" disabled={!rule} onClick={() => setEditing("plan")}>Edit plan</button>
        <ConfirmButton label="Skip this one" ask={confirmLabel("skip", occ)} onConfirm={() => void skip()} />
        <ConfirmButton danger label="End series" ask={confirmLabel("end", occ)} onConfirm={() => void endSeries()} />
      </div>
    </Sheet_>
  );
}
