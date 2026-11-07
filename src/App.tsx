import { Routes, Route, Navigate } from 'react-router-dom'
import RootLayout from '@/app/RootLayout'
import HomeScreen from '@/social/screens/HomeScreen'
import GamesScreen from '@/social/screens/GamesScreen'
import GameLobbyScreen from '@/social/screens/GameLobbyScreen'
import GamePlayScreen from '@/social/screens/GamePlayScreen'
import ChatScreen from '@/social/screens/ChatScreen'
import ProfileScreen from '@/social/screens/ProfileScreen'
import RewardsScreen from '@/social/screens/RewardsScreen'
import PremiumScreen from '@/social/screens/PremiumScreen'
import SettingsScreen from '@/social/screens/SettingsScreen'
import PrivacyScreen from '@/social/screens/PrivacyScreen'

export default function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/games" element={<GamesScreen />} />
        <Route path="/games/:gameId" element={<GameLobbyScreen />} />
        <Route path="/games/:gameId/play" element={<GamePlayScreen />} />
        <Route path="/chat" element={<ChatScreen />} />
        <Route path="/chat/:conversationId" element={<ChatScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/friends" element={<Navigate to="/chat?tab=friends" replace />} />
        <Route path="/me" element={<Navigate to="/profile" replace />} />
        <Route path="/rewards" element={<RewardsScreen />} />
        <Route path="/premium" element={<PremiumScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/privacy" element={<PrivacyScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
