// Standalone entry for the Wildbound-only APK (built with vite.wildbound.config.ts).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import './index.css'
import WildboundGame from './games/wildbound/WildboundGame'
import { initSocial } from './net/social'
import { initSound } from './lib/sound'
import { initAds } from './lib/ads'

initSocial()
initSound()
void initAds()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter>
      <WildboundGame />
    </MemoryRouter>
  </StrictMode>,
)
