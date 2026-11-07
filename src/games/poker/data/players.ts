import akash from '../ui/art/av_akash.webp'
import rohit from '../ui/art/av_rohit.webp'
import queens from '../ui/art/av_queens.webp'
import gamestar from '../ui/art/av_gamestar.webp'
import rahul from '../ui/art/av_rahul.webp'
import queensara from '../ui/art/av_queensara.webp'
import pokerking from '../ui/art/av_pokerking.webp'
import vikram from '../ui/art/av_vikram.webp'
import type { PortraitKey } from './regulars'

/** Portraits are shared by everyone (players pick one; the regulars each own one), so a face always reads the same. */
export const PORTRAITS: Record<PortraitKey, string> = { akash, rohit, queens, gamestar, rahul, queensara, pokerking, vikram }

export const portrait = (key: string): string => PORTRAITS[key as PortraitKey] ?? PORTRAITS.akash

export * from './regulars'
