import { Capacitor } from '@capacitor/core'
import { AdMob, AdmobConsentStatus, BannerAdPosition, BannerAdSize, RewardAdPluginEvents } from '@capacitor-community/admob'

/*
 * AdMob ads on the Android app (nothing is shown on the web build).
 * - rewarded: the player chooses to watch for coins
 * - interstitial: full-screen, only between games, at most every few finished games
 * - banner: a strip under the Games list, never inside a game
 *
 * Real ad unit IDs come from VITE_ADMOB_* at build time; without them Google's test ads are used.
 * The AdMob *app* ID lives in android/app/src/main/res/values/strings.xml (admob_app_id).
 */

const env = import.meta.env as Record<string, string | undefined>
const TEST = {
  banner: 'ca-app-pub-3940256099942544/9214589741',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
}
const IDS = {
  banner: env.VITE_ADMOB_BANNER || TEST.banner,
  interstitial: env.VITE_ADMOB_INTERSTITIAL || TEST.interstitial,
  rewarded: env.VITE_ADMOB_REWARDED || TEST.rewarded,
}
const usingTestAds = !env.VITE_ADMOB_REWARDED

export const adsAvailable = Capacitor.isNativePlatform()

/** Games finished between two interstitials. */
const INTERSTITIAL_EVERY = 3
export const REWARD_COINS = 100
export const REWARDS_PER_DAY = 5

let ready: Promise<boolean> | null = null
let gamesSinceInterstitial = 0
let interstitialLoaded = false

export function initAds(): Promise<boolean> {
  if (!adsAvailable) return Promise.resolve(false)
  ready ??= (async () => {
    try {
      await AdMob.initialize({ initializeForTesting: usingTestAds })
      // EU/UK players must be asked for consent before personalised ads
      const info = await AdMob.requestConsentInfo()
      if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) await AdMob.showConsentForm()
      void loadInterstitial()
      return true
    } catch (err) {
      console.warn('ads unavailable', err)
      return false
    }
  })()
  return ready
}

async function loadInterstitial() {
  try {
    await AdMob.prepareInterstitial({ adId: IDS.interstitial, isTesting: usingTestAds })
    interstitialLoaded = true
  } catch {
    interstitialLoaded = false
  }
}

/** Call when a game ends; shows a full-screen ad after every few finished games. */
export async function onGameFinished() {
  if (!(await initAds())) return
  gamesSinceInterstitial++
  if (gamesSinceInterstitial < INTERSTITIAL_EVERY || !interstitialLoaded) return
  gamesSinceInterstitial = 0
  interstitialLoaded = false
  try {
    // a short pause so the result screen shows first
    await new Promise((r) => setTimeout(r, 1500))
    await AdMob.showInterstitial()
  } catch {
    /* no fill: skip this time */
  }
  void loadInterstitial()
}

/** Shows a rewarded ad. Resolves true only if the player watched it to the end. */
export async function watchRewardedAd(): Promise<boolean> {
  if (!(await initAds())) return false
  let earned = false
  const handle = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
    earned = true
  })
  try {
    await AdMob.prepareRewardVideoAd({ adId: IDS.rewarded, isTesting: usingTestAds })
    await AdMob.showRewardVideoAd()
  } catch {
    earned = false
  } finally {
    await handle.remove()
  }
  return earned
}

export async function showBanner() {
  if (!(await initAds())) return
  try {
    // sits just above the bottom tab bar
    await AdMob.showBanner({ adId: IDS.banner, adSize: BannerAdSize.ADAPTIVE_BANNER, position: BannerAdPosition.BOTTOM_CENTER, margin: 84, isTesting: usingTestAds })
  } catch {
    /* no fill */
  }
}

export async function removeBanner() {
  if (!adsAvailable) return
  try {
    await AdMob.removeBanner()
  } catch {
    /* none showing */
  }
}

/** Lets players in regions that need it (EU/UK) change their ad consent later. */
export async function openAdPrivacyOptions(): Promise<boolean> {
  if (!(await initAds())) return false
  try {
    await AdMob.showPrivacyOptionsForm()
    return true
  } catch {
    return false
  }
}
