import { isCard, type Account } from "../data/schema";

/** <option>s for an account picker, grouped into bank accounts and credit cards when there are cards. */
export function AccountOptions({ accounts }: { accounts: Account[] }) {
  const banks = accounts.filter((a) => !isCard(a));
  const cards = accounts.filter(isCard);
  const opts = (list: Account[]) => list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>);
  if (!cards.length) return <>{opts(banks)}</>;
  return (
    <>
      {banks.length > 0 && <optgroup label="Bank accounts">{opts(banks)}</optgroup>}
      <optgroup label="Credit cards">{opts(cards)}</optgroup>
    </>
  );
}
