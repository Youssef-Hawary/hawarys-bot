// Static backdrop rendered with CSS only: a dark studio with an overhead key light,
// a perspective floor grid fading into the horizon, a vignette and film grain. Nothing moves.
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

export function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink-950">
      {/* key light from above + cool fill on the left */}
      <div className="absolute inset-0" style={{
        background: [
          'radial-gradient(70% 55% at 55% -10%, rgb(56 198 244 / .13), transparent 65%)',
          'radial-gradient(45% 40% at 0% 35%, rgb(60 90 160 / .10), transparent 70%)',
          'linear-gradient(180deg, #0A0D13 0%, #06080C 55%, #05070A 100%)',
        ].join(','),
      }} />
      {/* floor: perspective grid */}
      <div className="absolute inset-x-[-40%] bottom-[-10%] h-[70%]" style={{
        transform: 'perspective(700px) rotateX(68deg)',
        transformOrigin: '50% 100%',
        backgroundImage: 'linear-gradient(rgb(120 200 240 / .09) 1px, transparent 1px), linear-gradient(90deg, rgb(120 200 240 / .09) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
        maskImage: 'linear-gradient(0deg, rgb(0 0 0 / .9), transparent 85%)',
        WebkitMaskImage: 'linear-gradient(0deg, rgb(0 0 0 / .9), transparent 85%)',
      }} />
      {/* horizon haze */}
      <div className="absolute inset-x-0 top-[38%] h-[30%]" style={{ background: 'radial-gradient(60% 50% at 50% 50%, rgb(56 198 244 / .05), transparent 70%)' }} />
      {/* vignette + grain */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 40%, transparent 50%, rgb(0 0 0 / .65) 100%)' }} />
      <div className="absolute inset-0 opacity-[.035] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
    </div>
  );
}
