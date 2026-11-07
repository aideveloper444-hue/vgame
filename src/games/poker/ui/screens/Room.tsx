import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Copy, LogIn, Plus, Share2, X } from 'lucide-react'
import { Avatar, ScreenHeader, Tabs, fmt, toast } from '../kit'
import { useNav, useRoute } from '../../state/nav'
import { useProfile } from '../../state/profileStore'
import { api } from '../../net/api'
import { useLive } from '../../net/live'
import { inviteLink, rooms, useRoom } from '../../net/rooms'
import type { ClubFriend } from './Friends'

type Tab = 'create' | 'join'
const STACKS = [5000, 10000, 25000]
const BLINDS: [number, number][] = [
  [25, 50],
  [50, 100],
  [100, 200],
]

/** Private rooms on the club server: the host sets it up, friends join with the code, the server deals. */
export default function Room() {
  const route = useRoute()
  const p = useProfile()
  const go = useNav((s) => s.go)
  const { room, error, closedReason } = useRoom()
  const live = useLive((s) => s.status)
  const [tab, setTab] = useState<Tab>(route.params?.join ? 'join' : 'create')
  const [code, setCode] = useState(route.params?.join ?? '')
  const [size, setSize] = useState(6)
  const [stack, setStack] = useState(10000)
  const [blinds, setBlinds] = useState<[number, number]>([50, 100])
  const [friends, setFriends] = useState<ClubFriend[]>([])
  const [creating, setCreating] = useState(false)
  const asked = useRef(false)

  const loadFriends = useCallback(() => {
    api<ClubFriend[]>('/friends')
      .then((f) => setFriends(f.filter((x) => x.status === 'accepted')))
      .catch(() => {})
  }, [])
  useEffect(() => loadFriends(), [loadFriends])

  // invite links and invites from friends arrive with the code filled in
  useEffect(() => {
    if (asked.current) return
    asked.current = true
    if (route.params?.join && !room) rooms.join(route.params.join)
    const bot = route.params?.bot
    if (bot) {
      if (!room) rooms.create(size, stack, blinds[1])
      setTimeout(() => rooms.addBot(bot), room ? 0 : 500)
    }
  }, [route.params?.join, route.params?.bot, room, size, stack, blinds])

  useEffect(() => {
    if (room) setCreating(false)
  }, [room])
  useEffect(() => {
    if (error) {
      toast(error, 'bad')
      setCreating(false)
    }
  }, [error])
  useEffect(() => {
    if (closedReason) toast(closedReason, 'info')
  }, [closedReason])

  if (!p) return null
  const isHost = room?.hostId === p.id

  const share = async () => {
    if (!room) return
    const url = inviteLink(room.code)
    try {
      if (navigator.share) await navigator.share({ title: 'Royal Poker Club', text: `Join my poker table. Room code ${room.code}`, url })
      else {
        await navigator.clipboard.writeText(url)
        toast('Invite link copied', 'good')
      }
    } catch {
      /* dismissed */
    }
  }

  return (
    <div className="rpc-screen pb-10">
      <ScreenHeader title="Play with Friends" />
      {live !== 'online' && <p className="rpc-muted -mt-2 mb-2 text-center text-[0.85em]">Connecting to the club…</p>}

      {!room && (
        <div className="px-4">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { id: 'create', label: 'Create Room' },
              { id: 'join', label: 'Join Room' },
            ]}
          />
        </div>
      )}

      {!room && tab === 'create' && (
        <div className="mt-4 flex flex-col gap-4 px-4">
          <Picker label="Seats" options={[2, 3, 4, 5, 6].map((n) => [String(n), n])} value={size} onChange={setSize} />
          <Picker label="Starting chips" options={STACKS.map((s) => [fmt(s), s])} value={stack} onChange={setStack} />
          <Picker label="Blinds" options={BLINDS.map((b) => [`${b[0]}/${b[1]}`, b[1]])} value={blinds[1]} onChange={(bb) => setBlinds(BLINDS.find((b) => b[1] === bb)!)} />
          <p className="rpc-muted text-[0.85em]">Room chips are just for this game and never change anyone’s points.</p>
          <button
            disabled={creating}
            className="btn btn-gold rpc-shine h-14 text-[1.4em]"
            onClick={() => {
              setCreating(true)
              rooms.create(size, stack, blinds[1])
            }}
          >
            {creating ? (
              <span className="rpc-spinner" />
            ) : (
              <>
                <Plus size={24} strokeWidth={3} /> Create Room
              </>
            )}
          </button>
        </div>
      )}

      {!room && tab === 'join' && (
        <form
          className="mt-4 flex flex-col gap-3 px-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim().length !== 5) return toast('Room codes have 5 characters', 'bad')
            rooms.join(code)
          }}
        >
          <label className="rpc-field">
            <LogIn size={20} className="text-[#f2c98a]" aria-hidden />
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))} placeholder="Room code" aria-label="Room code" className="tracking-[0.3em]" />
          </label>
          <button className="btn btn-gold h-14 text-[1.4em]">Join Room</button>
        </form>
      )}

      {room && (
        <div className="mt-2 flex flex-col gap-4 px-4">
          <div className="gold-frame flex flex-col items-center rounded-2xl p-4">
            <p className="rpc-muted text-[0.9em]">Room code</p>
            <p className="rpc-display gold-text text-[2.6em] tracking-[0.2em]" data-room-code={room.code}>
              {room.code}
            </p>
            <p className="rpc-muted text-[0.85em]">
              Blinds {room.blinds[0]}/{room.blinds[1]} · {fmt(room.stack)} chips each
            </p>
            <div className="mt-2 flex gap-2">
              <button className="btn btn-dark h-10 px-4" onClick={() => void navigator.clipboard?.writeText(room.code).then(() => toast('Code copied', 'good'))}>
                <Copy size={16} /> Copy
              </button>
              <button className="btn btn-green h-10 px-4" onClick={() => void share()}>
                <Share2 size={16} /> Share link
              </button>
            </div>
          </div>

          <div>
            <p className="rpc-display mb-2 text-[1.1em] text-white" data-seats={room.members.length}>
              Seats {room.members.length}/{room.size}
            </p>
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: room.size }, (_, i) => {
                const m = room.members[i]
                if (!m)
                  return isHost ? (
                    <button key={i} onClick={() => rooms.addBot()} className="flex h-[112px] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-[#e9b33a]/50 text-[0.85em] text-[#ffd96a]">
                      <Bot size={26} /> Add computer
                    </button>
                  ) : (
                    <div key={i} className="grid h-[112px] place-items-center rounded-2xl border border-dashed border-white/20 text-[0.85em] text-white/40">
                      Waiting…
                    </div>
                  )
                return (
                  <div key={`${m.name}-${i}`} className="dark-frame relative flex h-[112px] flex-col items-center justify-center gap-1 rounded-2xl">
                    <Avatar avatar={m.avatar} size={52} />
                    <span className="rpc-display max-w-full truncate px-1 text-[0.95em] text-white">{m.name}</span>
                    <span className="text-[0.72em] text-white/50">{m.userId === room.hostId ? 'Host' : m.bot ? 'Computer' : m.online ? 'Friend' : 'Offline'}</span>
                    {isHost && m.userId !== room.hostId && (
                      <button aria-label={`Remove ${m.name}`} onClick={() => rooms.remove(i)} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white/70">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {isHost && friends.length > 0 && (
            <div>
              <p className="rpc-display mb-2 text-[1.1em] text-white">Invite friends</p>
              <div className="flex flex-col gap-2">
                {friends.slice(0, 8).map((f) => (
                  <div key={f.id} className="flex items-center gap-3">
                    <Avatar avatar={f.avatar} size={42} />
                    <span className="flex-1 text-white">
                      {f.name} <span className={`text-[0.82em] ${f.online ? 'text-green-400' : 'text-white/40'}`}>{f.online ? 'Online' : 'Offline'}</span>
                    </span>
                    <button
                      disabled={room.members.some((m) => m.userId === f.id)}
                      className="btn btn-gold h-9 px-4"
                      onClick={() => {
                        rooms.invite(f.id)
                        toast(`Invite sent to ${f.name}`, 'good')
                      }}
                    >
                      {room.members.some((m) => m.userId === f.id) ? 'Joined' : 'Invite'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isHost ? (
            <button disabled={room.members.length < 2} className="btn btn-green rpc-shine h-14 text-[1.4em]" onClick={() => rooms.start()}>
              Start game ({room.members.length} players)
            </button>
          ) : (
            <p className="rpc-muted text-center">Waiting for the host to start…</p>
          )}
          <button
            className="rpc-display text-[1.05em] text-red-300"
            onClick={() => {
              rooms.leave()
              go('home')
            }}
          >
            Leave room
          </button>
        </div>
      )}
    </div>
  )
}

function Picker<T extends number>({ label, options, value, onChange }: { label: string; options: [string, T][]; value: T; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="rpc-display mb-1.5 text-[1.05em] text-white">{label}</p>
      <div className="rpc-tabs">
        {options.map(([l, v]) => (
          <button key={l} role="tab" aria-selected={value === v} className="rpc-tab" onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}
