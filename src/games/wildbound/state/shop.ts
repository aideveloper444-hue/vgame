import { Capacitor } from '@capacitor/core'
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases'
import { create } from 'zustand'
import { ANIMALS, type AnimalId } from '../engine/content'
import { useSave } from './progress'

/*
 * Real-money products (Google Play Billing). Prices shown are the store's own localized prices once loaded;
 * until then the planned INR price is shown. Every grant is applied once per order id.
 *
 * Product ids to create in Play Console:
 *   wb_char_<animal>   one-time   each paid animal
 *   wb_pack_bigcats    one-time   Leo, Raja, Shadow, Jax
 *   wb_pack_wild       one-time   Arctic, Bruno, Titan, Koda, Snow
 *   wb_gems_50/250/650/1500   consumable gem packs
 */

export interface Product {
  id: string
  title: string
  inr: string
  consumable: boolean
  grant: { animals?: AnimalId[]; gems?: number }
}

const charProducts: Product[] = ANIMALS.filter((a) => !a.free).map((a) => ({ id: `wb_char_${a.id}`, title: `${a.name} the ${a.species}`, inr: '₹79.99', consumable: false, grant: { animals: [a.id] } }))

export const PRODUCTS: Product[] = [
  ...charProducts,
  { id: 'wb_pack_bigcats', title: 'Big Cats Pack', inr: '₹159', consumable: false, grant: { animals: ['leo', 'raja', 'shadow', 'jax'] } },
  { id: 'wb_pack_wild', title: 'Wild Ones Pack', inr: '₹199', consumable: false, grant: { animals: ['arctic', 'bruno', 'titan', 'koda', 'snow'] } },
  { id: 'wb_gems_50', title: '50 Gems', inr: '₹89', consumable: true, grant: { gems: 50 } },
  { id: 'wb_gems_250', title: '250 Gems', inr: '₹349', consumable: true, grant: { gems: 250 } },
  { id: 'wb_gems_650', title: '650 Gems', inr: '₹699', consumable: true, grant: { gems: 650 } },
  { id: 'wb_gems_1500', title: '1500 Gems', inr: '₹1,299', consumable: true, grant: { gems: 1500 } },
]
export const product = (id: string) => PRODUCTS.find((p) => p.id === id)
export const charProductId = (id: AnimalId) => `wb_char_${id}`

export const storeAvailable = () => Capacitor.getPlatform() === 'android'

export const usePrices = create<{ prices: Record<string, string>; loaded: boolean }>(() => ({ prices: {}, loaded: false }))
export const priceOf = (id: string) => usePrices.getState().prices[id] ?? product(id)?.inr ?? ''

export async function loadPrices() {
  if (!storeAvailable() || usePrices.getState().loaded) return
  try {
    const { products } = await NativePurchases.getProducts({ productIdentifiers: PRODUCTS.map((p) => p.id), productType: PURCHASE_TYPE.INAPP } as never)
    const prices: Record<string, string> = {}
    for (const p of products as { identifier: string; priceString: string }[]) prices[p.identifier] = p.priceString
    usePrices.setState({ prices, loaded: true })
  } catch {
    usePrices.setState({ loaded: true })
  }
}

/** Run the platform purchase and grant on success. Throws with a plain-language message otherwise. */
export async function purchase(id: string): Promise<void> {
  const p = product(id)
  if (!p) throw new Error('This item is not for sale')
  if (!storeAvailable()) throw new Error('Purchases are made in the Android app through Google Play')
  const owned = useSave.getState().owned
  if (p.grant.animals && p.grant.animals.every((a) => owned.includes(a))) throw new Error('You already own everything in this')
  let tx: { transactionId?: string; orderId?: string; purchaseToken?: string }
  try {
    tx = (await NativePurchases.purchaseProduct({ productIdentifier: id, productType: PURCHASE_TYPE.INAPP, isConsumable: p.consumable, quantity: 1 } as never)) as typeof tx
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    throw new Error(/cancel/i.test(msg) ? 'Purchase cancelled' : 'The purchase did not go through. You have not been charged.')
  }
  const order = tx.orderId ?? tx.transactionId ?? tx.purchaseToken
  if (!order) throw new Error('The store did not confirm the purchase')
  useSave.getState().applyPurchase(order, p.grant)
}

/** Give back everything this Google account already bought (new phone, reinstall). */
export async function restorePurchases(): Promise<number> {
  if (!storeAvailable()) throw new Error('Restore works in the Android app')
  const { purchases } = (await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP } as never)) as { purchases: { productIdentifier: string; orderId?: string; transactionId?: string; purchaseToken?: string }[] }
  let n = 0
  for (const t of purchases) {
    const p = product(t.productIdentifier)
    if (!p || p.consumable) continue
    const order = t.orderId ?? t.transactionId ?? t.purchaseToken ?? t.productIdentifier
    if (useSave.getState().applyPurchase(`restore:${order}`, p.grant)) n++
  }
  return n
}
