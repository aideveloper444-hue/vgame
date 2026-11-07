import { Capacitor } from '@capacitor/core'
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases'
import { PLAY_PRODUCTS, productIdFor } from '../data/cosmetics'
import { api } from './api'
import type { Me } from '../state/profileStore'

/*
 * Cosmetics and VIP through Google Play Billing. The app only starts the purchase; the club server checks
 * the purchase token with Google, grants the item once and acknowledges it.
 */

export const storeAvailable = () => Capacitor.getPlatform() === 'android'

export async function buy(itemId: string): Promise<Me> {
  const productId = productIdFor(itemId)
  if (!productId) throw new Error('This item isn’t sold')
  if (!storeAvailable()) throw new Error('Purchases are made in the Android app')
  const sub = PLAY_PRODUCTS[productId].type === 'subs'
  const tx = await NativePurchases.purchaseProduct({
    productIdentifier: productId,
    productType: sub ? PURCHASE_TYPE.SUBS : PURCHASE_TYPE.INAPP,
    ...(sub ? { planIdentifier: 'monthly' } : {}),
    quantity: 1,
  } as never)
  const token = (tx as { purchaseToken?: string }).purchaseToken
  if (!token) throw new Error('The purchase didn’t complete')
  const r = await api<{ me: Me }>('/purchases/verify', { body: { productId, purchaseToken: token } })
  return r.me
}

/** Re-check everything this Google account bought (new phone, reinstall). */
export async function restore(): Promise<Me | null> {
  if (!storeAvailable()) return null
  const all = []
  for (const productType of [PURCHASE_TYPE.INAPP, PURCHASE_TYPE.SUBS]) {
    const { purchases } = await NativePurchases.getPurchases({ productType } as never)
    for (const p of purchases as { productIdentifier: string; purchaseToken?: string }[]) if (p.purchaseToken) all.push({ productId: p.productIdentifier, purchaseToken: p.purchaseToken })
  }
  if (!all.length) return null
  const r = await api<{ me: Me }>('/purchases/restore', { body: { purchases: all } })
  return r.me
}
