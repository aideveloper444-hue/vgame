// Art cut from the ALPHAZOX reference screen (2x upscaled), bundled by Vite.
import board from './art/board.webp'
import logo from './art/logo.png'
import crown from './art/crown.png'
import coin from './art/coin.png'
import gem from './art/gem.png'
import special from './art/special.webp'
import avRohan from './art/av_rohan.webp'
import avDiya from './art/av_diya.webp'
import avSneha from './art/av_sneha.webp'
import avDoctor from './art/av_doctor.webp'
import tokRohan from './art/tok_rohan.png'
import tokDiya from './art/tok_diya.png'
import tokSneha from './art/tok_sneha.png'
import tokDoctor from './art/tok_doctor.png'
import btnMap from './art/btn_map.webp'
import btnBuild from './art/btn_build.webp'
import btnAttack from './art/btn_attack.webp'
import btnDefend from './art/btn_defend.webp'
import btnItems from './art/btn_items.webp'
import type { SeatTheme } from './alphaLayout'

export const BOARD_IMG = board
export const LOGO_IMG = logo
export const CROWN_IMG = crown
export const COIN_IMG = coin
export const GEM_IMG = gem
export const SPECIAL_IMG = special

export const AVATAR_ART: Record<SeatTheme['key'], string> = { rohan: avRohan, diya: avDiya, sneha: avSneha, doctor: avDoctor }
export const TOKEN_ART: Record<SeatTheme['key'], string> = { rohan: tokRohan, diya: tokDiya, sneha: tokSneha, doctor: tokDoctor }
export const BUTTON_ART = { map: btnMap, build: btnBuild, attack: btnAttack, defend: btnDefend, items: btnItems }

/** Every image the screen needs, so the match can wait for them instead of popping in. */
export const ALL_ALPHA_ART = [board, logo, crown, coin, gem, special, avRohan, avDiya, avSneha, avDoctor, tokRohan, tokDiya, tokSneha, tokDoctor, btnMap, btnBuild, btnAttack, btnDefend, btnItems]
