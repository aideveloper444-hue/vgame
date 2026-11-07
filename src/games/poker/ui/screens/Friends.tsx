import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Share2, UserPlus, X } from 'lucide-react'
import { Avatar, Empty, ScreenHeader, Sheet, Tabs, toast } from '../kit'
import BottomNav from '../BottomNav'
import { REGULARS } from '../../data/regulars'
import { useNav } from '../../state/nav'
import { useProfile } from '../../state/profileStore'
import { api } from '../../net/api'
import { onLive } from '../../net/live'
import { inviteLink, rooms, useRoom } from '../../net/rooms'
import { ReportSheet } from './Report'

type Tab = 'friends' | 'add'

export interface ClubFriend {
  id: string
  name: string
  avatar: string
  status: 'accepted' | 'requested' | 'incoming'
  online: boolean
  level: number
}

/** Screen 8: friends on the club server, plus the computer regulars you can seat at your table. */
export default function Friends() {
  const p = useProfile()
  const go = useNav((s) => s.go)
  const room = useRoom((s) => s.room)
  const [tab, setTab] = useState<Tab>('friends')
  const [query, setQuery] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [friends, setFriends] = useState<ClubFriend[]>([])
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState<ClubFriend | null>(null)
  const [report, setReport] = useState<{ id: string; name: string } | null>(null)

  const load = useCallback(() => {
    api<ClubFriend[]>('/friends')
      .then(setFriends)
      .catch((e: Error) => toast(e.message, 'bad'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    load()
    return onLive((m) => {
      if (m.type === 'FRIENDS_CHANGED') load()
      if (m.type === 'PRESENCE') setFriends((fs) => fs.map((f) => (f.id === m.userId ? { ...f, online: !!m.online } : f)))
    })
  }, [load])

  const match = (name: string) => !query || name.toLowerCase().includes(query.toLowerCase())
  const accepted = useMemo(() => friends.filter((f) => f.status === 'accepted' && match(f.name)).sort((a, b) => Number(b.online) - Number(a.online)), [friends, query]) // eslint-disable-line react-hooks/exhaustive-deps
  const incoming = friends.filter((f) => f.status === 'incoming')
  const outgoing = friends.filter((f) => f.status === 'requested')
  const regulars = REGULARS.filter((r) => match(r.name))
  if (!p) return null

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Copied!', 'good')
    } catch {
      toast(text, 'info')
    }
  }

  /** Invite a friend: open (or reuse) your private room and send them a live invite. */
  const invite = (f: ClubFriend) => {
    if (!room) rooms.create(6, 10000, 100)
    // the room is created on the server first; the invite follows right after
    setTimeout(() => rooms.invite(f.id), room ? 0 : 500)
    toast(`Invite sent to ${f.name}`, 'good')
    go('room')
  }

  const add = async () => {
    try {
      const r = await api<{ status: string; name: string }>('/friends/requests', { body: { code } })
      toast(r.status === 'accepted' ? `You and ${r.name} are now friends` : `Friend request sent to ${r.name}`, 'good')
      setCode('')
      load()
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }

  const share = async () => {
    const text = `Play poker with me at Royal Poker Club! Add me with my code ${p.inviteCode}${room ? ` or join my table ${room.code}` : ''}.`
    const url = room ? inviteLink(room.code) : `${location.origin}/games/poker/play`
    try {
      if (navigator.share) await navigator.share({ title: 'Royal Poker Club', text, url })
      else await copy(`${text} ${url}`)
    } catch {
      /* share sheet dismissed */
    }
  }

  const act = async (path: string, method: string, done: string) => {
    try {
      await api(path, { method, body: method === 'POST' ? {} : undefined })
      toast(done, 'info')
      load()
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }

  return (
    <div className="rpc-screen rpc-with-nav">
      <ScreenHeader
        title="Friends"
        right={
          <button aria-label="Search friends" onClick={() => setQuery((q) => (q == null ? '' : null))} className="grid h-10 w-10 place-items-center">
            {query == null ? <Search size={28} color="#f5d27a" strokeWidth={2.6} /> : <X size={26} color="#f5d27a" />}
          </button>
        }
      />
      {query != null && (
        <div className="px-4 pb-3">
          <label className="rpc-field">
            <Search size={18} className="text-[#f2c98a]" aria-hidden />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name" aria-label="Search friends" />
          </label>
        </div>
      )}
      <div className="px-4">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { id: 'friends', label: 'My Friends' },
            { id: 'add', label: `Add Friends${incoming.length ? ` (${incoming.length})` : ''}` },
          ]}
        />
      </div>

      {tab === 'friends' && (
        <div className="mt-2 px-4">
          {loading && <div className="rpc-spinner mx-auto my-4" />}
          {accepted.map((f) => (
            <FriendRow key={f.id} avatar={f.avatar} name={f.name} status={f.online ? 'Online' : 'Offline'} online={f.online} onInvite={() => invite(f)} onOpen={() => setPicked(f)} />
          ))}
          {!loading && accepted.length === 0 && query == null && (
            <p className="rpc-muted py-2 text-center text-[0.9em]">
              No friends yet.{' '}
              <button className="text-[#ffd96a] underline" onClick={() => setTab('add')}>
                Add one with their code
              </button>
            </p>
          )}
          <p className="rpc-display mb-1 mt-3 text-[1em] text-[#ffd96a]">Club regulars · computer players</p>
          {regulars.slice(0, query ? 7 : 4).map((r) => (
            <FriendRow key={r.name} avatar={r.avatar} name={r.name} status="Ready to play" online ai onInvite={() => go('room', { bot: r.name })} />
          ))}
        </div>
      )}

      {tab === 'add' && (
        <div className="mt-4 flex flex-col gap-3 px-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (code.trim()) void add()
            }}
          >
            <label className="rpc-field flex-1">
              <UserPlus size={20} className="text-[#f2c98a]" aria-hidden />
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Friend code or player name" aria-label="Friend code or name" maxLength={20} />
            </label>
            <button className="btn btn-gold h-[52px] px-4 text-[1.1em]">Add</button>
          </form>
          {incoming.map((r) => (
            <div key={r.id} className="dark-frame flex items-center gap-3 rounded-2xl p-3">
              <Avatar avatar={r.avatar} size={48} />
              <span className="rpc-display flex-1 text-[1.1em] text-white">{r.name}</span>
              <button className="btn btn-green h-9 px-3" onClick={() => void act(`/friends/requests/${r.id}/accept`, 'POST', `You and ${r.name} are now friends`)}>
                Accept
              </button>
              <button className="btn btn-dark h-9 px-3" onClick={() => void act(`/friends/requests/${r.id}/decline`, 'POST', 'Request declined')}>
                Decline
              </button>
            </div>
          ))}
          {outgoing.map((f) => (
            <div key={f.id} className="dark-frame flex items-center gap-3 rounded-2xl p-3 opacity-80">
              <Avatar avatar={f.avatar} size={44} />
              <span className="flex-1 text-white">{f.name}</span>
              <span className="rpc-muted text-[0.85em]">Request sent</span>
            </div>
          ))}
          {incoming.length === 0 && outgoing.length === 0 && <Empty title="Grow your table" body="Swap invite codes (or exact player names) with people you know. Once they accept, invite them to your private room." />}
        </div>
      )}

      <div className="gold-frame mx-4 mt-4 flex flex-col items-center rounded-2xl px-4 py-3">
        <p className="rpc-display text-[1.3em] text-white">Invite Your Friends</p>
        <p className="rpc-display text-[1.05em] text-white/90">Share your code</p>
        <div className="mt-2 flex w-full max-w-[300px] gap-2">
          <span className="rpc-display flex h-11 flex-1 items-center justify-center rounded-xl bg-black/80 text-[1.35em] tracking-wide text-white" style={{ boxShadow: 'inset 0 0 0 1px rgba(233,179,58,.55)' }}>
            {p.inviteCode}
          </span>
          <button className="rpc-display h-11 rounded-xl bg-black/80 px-4 text-[1.3em] text-[#ffd96a]" style={{ boxShadow: 'inset 0 0 0 1.5px #e9b33a' }} onClick={() => void copy(p.inviteCode)}>
            Copy
          </button>
        </div>
        <button className="btn btn-green rpc-shine mt-3 h-[56px] w-full text-[1.45em]" onClick={() => void share()}>
          <Share2 size={26} strokeWidth={2.6} /> Invite Friends
        </button>
      </div>

      <Sheet open={!!picked} onClose={() => setPicked(null)} title={picked?.name}>
        {picked && (
          <div className="grid grid-cols-1 gap-2">
            <button className="btn btn-gold h-12" onClick={() => (setPicked(null), invite(picked))}>
              Invite to my table
            </button>
            <button className="btn btn-dark h-12" onClick={() => (setReport({ id: picked.id, name: picked.name }), setPicked(null))}>
              Report
            </button>
            <button className="btn btn-dark h-12" onClick={() => (void api('/blocks', { body: { userId: picked.id } }).then(load), toast(`${picked.name} blocked`, 'info'), setPicked(null))}>
              Block
            </button>
            <button className="btn btn-dark h-12 text-red-300" onClick={() => (void act(`/friends/${picked.id}`, 'DELETE', 'Friend removed'), setPicked(null))}>
              Remove friend
            </button>
          </div>
        )}
      </Sheet>
      <ReportSheet target={report} onClose={() => setReport(null)} />
      <BottomNav />
    </div>
  )
}

function FriendRow({ avatar, name, status, online, ai, onInvite, onOpen }: { avatar: string; name: string; status: string; online: boolean; ai?: boolean; onInvite: () => void; onOpen?: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-[#e9b33a]/20 py-2.5">
      <button onClick={onOpen} className="relative" aria-label={`${name} options`} disabled={!onOpen}>
        <Avatar avatar={avatar} size={58} />
        {online && <span className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-2 border-black bg-[#22c55e]" />}
      </button>
      <button onClick={onOpen} disabled={!onOpen} className="min-w-0 flex-1 text-left">
        <p className="rpc-display flex items-center gap-1.5 truncate text-[1.3em] text-white">
          {name}
          {ai && <span className="rounded bg-white/10 px-1.5 text-[0.55em] font-semibold tracking-wide text-white/70">AI</span>}
        </p>
        <p className={`rpc-display truncate text-[1.05em] ${online ? 'text-[#22d36a]' : 'text-white/60'}`}>{status}</p>
      </button>
      <button className="btn btn-gold h-[46px] w-[106px] text-[1.35em]" onClick={onInvite}>
        Invite
      </button>
    </div>
  )
}
