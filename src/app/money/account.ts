import { actions, appStore } from '../../lib/appStore';
import { visible } from '../../lib/records';

/*
 * The screen shows one account, whatever cards older data has: the money is their sum and new
 * operations go to the first of them.
 */

const banks = () => visible(appStore.get().shared.banks).sort((a, b) => a.order - b.order);

export const totalOf = (list: { sum: number }[]) => list.reduce((t, b) => t + b.sum, 0);

/** The record that holds the account's money; made on first use. */
export function accountId(): string {
  return banks()[0]?.id ?? actions.addBank('tbank', 0).id;
}

/** Makes the account show exactly this much. */
export function setBalance(total: number) {
  const id = accountId();
  actions.updateBank(id, { sum: total - totalOf(banks().filter((b) => b.id !== id)) });
}

export const balance = () => totalOf(banks());
