import { Capacitor } from '@capacitor/core'
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases'
import { BOARD_PRICE_INR, FREE_THEMES, THEME_ORDER, useBoardTheme, useOwnedBoards, type BoardThemeId } from './ludoThemes'

/*
 * Ludo's board unlocks: every board outside FREE_THEMES is a one-time purchase on Google Play (never coins or
 * gems). Product ids to create in Play Console, one-time, at the BOARD_PRICE_INR price:
 *   ludo_board_rune, ludo_board_steam, ludo_board_pirate, ludo_board_grove, ludo_board_space
 */

export const boardProductId = (id: BoardThemeId) => `ludo_board_${id}`
export const LOCKED_THEMES = THEME_ORDER.filter((id) => !FREE_THEMES.includes(id))
export const boardStoreAvailable = () => Capacitor.getPlatform() === 'android'
export { BOARD_PRICE_INR }

/** Buy a board on Google Play, unlock it and put it on the table. Throws a plain-language message otherwise. */
export async function purchaseBoard(id: BoardThemeId): Promise<void> {
  if (FREE_THEMES.includes(id) || useOwnedBoards.getState().owned.includes(id)) {
    useBoardTheme.getState().setTheme(id)
    return
  }
  if (!boardStoreAvailable()) throw new Error('Boards are unlocked in the Android app through Google Play')
  let tx: { transactionId?: string; orderId?: string; purchaseToken?: string }
  try {
    tx = (await NativePurchases.purchaseProduct({ productIdentifier: boardProductId(id), productType: PURCHASE_TYPE.INAPP, isConsumable: false, quantity: 1 } as never)) as typeof tx
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    throw new Error(/cancel/i.test(msg) ? 'Purchase cancelled' : 'The purchase did not go through. You have not been charged.')
  }
  if (!(tx.orderId ?? tx.transactionId ?? tx.purchaseToken)) throw new Error('The store did not confirm the purchase')
  useOwnedBoards.getState().grant([id])
  useBoardTheme.getState().setTheme(id)
}

/** Give back every board this Google account already bought (new phone, reinstall). Returns how many. */
export async function restoreBoards(): Promise<number> {
  if (!boardStoreAvailable()) throw new Error('Restore works in the Android app')
  const { purchases } = (await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP } as never)) as { purchases: { productIdentifier: string }[] }
  const ids = LOCKED_THEMES.filter((id) => purchases.some((p) => p.productIdentifier === boardProductId(id)))
  useOwnedBoards.getState().grant(ids)
  return ids.length
}
