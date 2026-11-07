import { BackButton } from '@/social/components/ui'
import { SUPPORT_EMAIL } from '@/social/components/ReportSheet'

const UPDATED = '13 October 2026'

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'The short version',
    body: [
      'VIBO has no accounts and no analytics. Your profile, friends list, chats and game progress are stored only on your own phone.',
      'The app shows ads from Google AdMob, which uses your phone’s advertising ID (see “Ads” below).',
      'Chat messages and voice go directly between your phone and your friends’ phones. We do not run a server that stores them.',
    ],
  },
  {
    title: 'What is stored on your phone',
    body: [
      'Your name, avatar, level, coins and game statistics; your friends list and the players you blocked; your direct messages; and your settings. A random 8-character friend code is created when you first open the app.',
      'Uninstalling the app or tapping Settings → Delete all my data removes all of it.',
    ],
  },
  {
    title: 'How online play works',
    body: [
      'To find your friends online, the app connects to the free PeerJS connection service (0.peerjs.com). It sees your friend code and your IP address while you are online, so it can introduce your phone to your friends’ phones. It does not see your messages or hear your voice.',
      'To set up direct connections the app also uses Google’s public STUN servers, which see your IP address.',
      'When you are online, your friends can see your name, avatar, level and the game you are playing.',
    ],
  },
  {
    title: 'Ads',
    body: [
      'VIBO shows ads through Google AdMob: an optional “watch an ad for coins” video, a full-screen ad between some games, and a banner on the games list. Ads never appear while you are playing.',
      'To show and measure ads, Google collects your phone’s advertising ID, IP address and basic device information, and may use them for personalised ads where the law allows. Google’s policy: https://policies.google.com/technologies/ads',
      'In the EU and UK you are asked for consent first, and you can change your choice any time in Settings → Ad privacy choices. You can also reset or delete your advertising ID in your phone’s Google settings.',
    ],
  },
  {
    title: 'Microphone',
    body: [
      'The microphone is used only for party voice chat, and only after you tap “Join voice chat”. Your voice is streamed live to the people in your party. It is never recorded or stored.',
    ],
  },
  {
    title: 'Blocking and reporting',
    body: [
      'You can block any player from their chat, their friend entry or the party list. Blocked players can’t message you, invite you or add you.',
      'If you report a player, your email app opens with the report and their recent messages to you, so you choose whether to send it.',
    ],
  },
  {
    title: 'Children',
    body: ['VIBO is not directed at children under 13. Chat is only possible with people you add by friend code.'],
  },
  {
    title: 'Changes and contact',
    body: [
      'If this policy changes, the new version will be shown here with a new date.',
      SUPPORT_EMAIL ? `Questions or reports: ${SUPPORT_EMAIL}` : 'Questions or reports: use the contact email on the app’s Google Play page.',
    ],
  },
]

export default function PrivacyScreen() {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-4">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-2xl font-black text-white">Privacy policy</h1>
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-500">Last updated {UPDATED}</p>
      <div className="mt-5 space-y-6">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="text-base font-extrabold text-white">{s.title}</h2>
            {s.body.map((p) => (
              <p key={p} className="mt-2 max-w-[65ch] text-sm leading-relaxed text-slate-300">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
