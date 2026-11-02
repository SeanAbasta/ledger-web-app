import { useEffect, useState } from "react";
import { labelShort } from "../../data/dates";
import { formatMinor } from "../../data/money";
import type { Trip } from "../../data/schema";
import { budgetLeft, concludedTotal, tripEnd, tripTotals } from "../../data/tripMath";
import { Empty } from "../../ui/Empty";
import { TravelIcon } from "../../ui/icons";
import { TripView } from "./TripView";
import { useTravelData, type TravelData } from "./travelData";

const dates = (t: Trip) => (t.days === 1 ? labelShort(t.start) : `${labelShort(t.start)} to ${labelShort(tripEnd(t))}`);

/** The Travel room: your trips, open ones first. Tap one to go into its own ledger. */
export function Travel({ initialTrip, onPlan, onShowInLedger }: { initialTrip?: string; onPlan: () => void; onShowInLedger: (tripId: string) => void }) {
  const data = useTravelData();
  const [openId, setOpenId] = useState(initialTrip);
  useEffect(() => { if (initialTrip) setOpenId(initialTrip); }, [initialTrip]);
  if (!data) return null;
  const trip = data.trips.find((t) => t.id === openId);
  if (trip) return <TripView trip={trip} data={data} onBack={() => setOpenId(undefined)} onShowInLedger={onShowInLedger} />;

  const open = data.trips.filter((t) => t.status === "open");
  const done = data.trips.filter((t) => t.status === "concluded");
  if (!data.trips.length) {
    return <Empty icon={<TravelIcon />} title="No trips yet" note="Plan a trip to gather its expenses, in any currency, before they reach your Ledger." action={{ label: "Plan a trip", onClick: onPlan }} />;
  }
  return (
    <div className="travel">
      <div className="toolrow"><span /><button type="button" className="btn ghost sm" onClick={onPlan}>Plan a trip</button></div>
      {open.length > 0 && <TripList heading="Open" trips={open} data={data} onOpen={setOpenId} />}
      {done.length > 0 && <TripList heading="Concluded" trips={done} data={data} onOpen={setOpenId} />}
    </div>
  );
}

function TripList({ heading, trips, data, onOpen }: { heading: string; trips: Trip[]; data: TravelData; onOpen: (id: string) => void }) {
  return (
    <>
      <div className="grp" role="heading" aria-level={2}>{heading}</div>
      <div className="card">
        {trips.map((t) => <TripRow key={t.id} trip={t} data={data} onOpen={() => onOpen(t.id)} />)}
      </div>
    </>
  );
}

function TripRow({ trip, data, onOpen }: { trip: Trip; data: TravelData; onOpen: () => void }) {
  const items = data.items.filter((i) => i.tripId === trip.id);
  const t = tripTotals(trip, items, data.base);
  if (trip.status === "concluded") {
    const total = concludedTotal(data.posted.filter((e) => e.tripId === trip.id));
    return (
      <button className="row item" onClick={onOpen}>
        <span className="main">
          <span className="l1">{trip.name}</span>
          <span className="l2"><span>{dates(trip)}</span><span className="tag">{data.posted.filter((e) => e.tripId === trip.id).length} in Ledger</span></span>
        </span>
        <span className="money"><span>{formatMinor(total, data.base)}</span></span>
      </button>
    );
  }
  const left = budgetLeft(trip, t);
  return (
    <button className="row item" onClick={onOpen}>
      <span className="main">
        <span className="l1">{trip.name}</span>
        <span className="l2"><span>{dates(trip)}</span><span className="tag">{t.final} of {t.count} final</span></span>
      </span>
      <span className="money">
        <span>{formatMinor(t.mine, data.base)}</span>
        {trip.budget !== undefined && <span className="approx">{left! >= 0 ? `of ${formatMinor(trip.budget, data.base)}` : `${formatMinor(-left!, data.base)} over`}</span>}
      </span>
    </button>
  );
}

