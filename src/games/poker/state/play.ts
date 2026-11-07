import { onLive, send, useLive } from '../net/live'
import { useNav } from './nav'
import { openServerTable, usePokerTable } from './tableStore'
import type { TableMode } from '../data/tables'
import { toast } from '../ui/kit'

/*
 * Getting to a table. The server decides where a player sits and answers with TABLE_ASSIGNED (also sent
 * on reconnect and when a tournament starts or moves you); this module turns that into the table screen.
 */

let waitingFor: string | null = null

export function sitCash(tierId: string) {
  if (useLive.getState().status !== 'online') toast('Connecting to the club…', 'info')
  waitingFor = 'SIT'
  send({ type: 'SIT', tier: tierId })
}

export function registerTourney(id: string) {
  send({ type: 'TOURNEY_REGISTER', id })
}
export function unregisterTourney(id: string) {
  send({ type: 'TOURNEY_UNREGISTER', id })
}

onLive((m) => {
  if (m.type === 'TABLE_ASSIGNED') {
    const st = usePokerTable.getState()
    // tournament table moves are handled inside the table store
    if (st.open && st.role === 'server' && st.mode === 'tournament' && m.mode === 'tournament') return
    if (st.open && st.tableId === m.tableId) return
    if (st.open && st.role === 'solo' && m.resumed) return // practising; the server seat waits
    waitingFor = null
    openServerTable(String(m.tableId), (m.mode as TableMode) ?? 'classic')
    const nav = useNav.getState()
    const top = nav.stack[nav.stack.length - 1]
    if (top.name === 'room' || top.name === 'tournament') nav.replace('table')
    else if (top.name !== 'table') nav.go('table')
    if (m.mode === 'tournament' && !m.resumed) toast('Your tournament has started. Good luck!', 'good')
  }
  if (m.type === 'ERROR' && (m.ref === 'SIT' || m.ref === 'TOURNEY_REGISTER' || m.ref === 'REBUY')) {
    if (m.ref === waitingFor) waitingFor = null
    toast(String(m.message), 'bad')
  }
  if (m.type === 'TOURNEY_SOON') toast('Your tournament starts in 10 minutes', 'info')
})
