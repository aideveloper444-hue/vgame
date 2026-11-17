/** Ludo's wallpaper (menu and loading screen): the Royal Jewel board centred, as big as the screen allows. */
export default function LudoJewelWallpaper({ dim = 0.42 }: { dim?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden bg-[#07040f]">
      <img src="/textures/ludo/board-jewel.jpg" alt="" className="absolute h-full w-full scale-110 object-cover opacity-40 blur-2xl" draggable={false} />
      <img src="/textures/ludo/board-jewel.jpg" alt="" className="relative aspect-square w-[min(100vw,100vh)] object-contain shadow-[0_30px_90px_rgba(0,0,0,0.75)]" draggable={false} />
      <div className="absolute inset-0" style={{ background: `rgba(7,4,15,${dim})` }} />
    </div>
  )
}
