import { useId } from "react";

/** Decorative energy route: arrows describe the process, not measured consumption. */
export function SchoolEnergyScene() {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 640 420"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x2="0" y2="1">
          <stop stopColor="var(--scene-sky)" />
          <stop offset="1" stopColor="var(--scene-horizon)" />
        </linearGradient>
        <radialGradient id={`${id}-sun`}>
          <stop stopColor="var(--scene-sun-glow)" />
          <stop offset=".65" stopColor="var(--scene-sun-halo)" />
          <stop offset="1" stopColor="var(--scene-sun-halo)" stopOpacity="0" />
        </radialGradient>
        <marker
          id={`${id}-arrow`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0 0 10 5 0 10z" fill="var(--scene-solar-flow)" />
        </marker>
        <marker
          id={`${id}-green`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0 0 10 5 0 10z" fill="var(--scene-energy-flow)" />
        </marker>
      </defs>
      <path fill={`url(#${id}-sky)`} d="M0 0h640v420H0z" />
      <path d="M0 307Q100 257 218 308T440 304T640 302V420H0z" fill="var(--scene-hill)" />
      <path d="M0 336Q180 299 320 331T640 321V420H0z" fill="var(--scene-ground)" />
      <circle cx="472" cy="81" r="70" fill={`url(#${id}-sun)`} />
      <circle cx="472" cy="81" r="25" fill="var(--scene-sun)" />
      <g stroke="var(--scene-rays)" strokeWidth="3" strokeLinecap="round">
        {Array.from({ length: 8 }, (_, i) => (
          <path key={i} d="M472 40v-8" transform={`rotate(${i * 45} 472 81)`} />
        ))}
      </g>
      <g fill="var(--scene-cloud)" opacity=".45">
        <path d="M70 94c-3-22 27-31 37-13 16-17 44-2 40 13z" />
        <path d="M533 170c-3-16 19-24 28-11 12-12 34-3 31 11z" />
      </g>
      <ellipse cx="326" cy="349" rx="189" ry="19" fill="var(--scene-shadow)" opacity=".4" />
      <g stroke="var(--scene-outline)" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M157 235h248v108H157z" fill="var(--scene-wall)" />
        <path d="m405 235 62-29v115l-62 22z" fill="var(--scene-wall-side)" />
        <path d="m140 235 64-74h204l62 45-65 29z" fill="var(--scene-roof)" />
        <path d="m190 219 43-48h156l48 34-43 14z" fill="var(--scene-panel)" />
        <g stroke="var(--scene-panel-grid)" strokeWidth="1.3">
          <path d="m204 204 205-13M218 187l202 15M258 171l-36 48M286 171l-27 48M315 171l-20 48M344 171l-10 48M372 171l-2 48" />
        </g>
        <path d="M265 293h40v50h-40z" fill="var(--scene-door)" />
        <path d="M285 294v49" />
        {[180, 225, 330, 375].map((x) => (
          <g key={x}>
            <path d={`M${x} 254h22v25h-22z`} fill="var(--scene-window)" />
            <path d={`M${x + 11} 254v25`} />
          </g>
        ))}
        <path d="m424 252 24-11v25l-24 11z" fill="var(--scene-window-side)" />
        <path d="m427 289 23-10v35l-23 10z" fill="var(--scene-cloud)" />
        <path d="m436 294 6-3v11l-6 3z" fill="var(--scene-energy-flow)" />
      </g>
      <g fill="var(--scene-tree)">
        <path d="M117 340v-32h3v32z" />
        <circle cx="118" cy="300" r="20" />
        <path d="M500 338v-34h3v34z" />
        <circle cx="501" cy="296" r="24" />
      </g>
      <path
        d="M451 103 367 146"
        stroke="var(--scene-solar-flow)"
        strokeWidth="3"
        strokeDasharray="5 7"
        fill="none"
        markerEnd={`url(#${id}-arrow)`}
      />
      <path
        d="M393 218v34h47v27"
        stroke="var(--scene-energy-flow)"
        strokeWidth="3"
        fill="none"
        markerEnd={`url(#${id}-green)`}
      />
      <path
        d="M439 327v25H313v-24"
        stroke="var(--scene-energy-flow)"
        strokeWidth="3"
        fill="none"
        markerEnd={`url(#${id}-green)`}
      />
      <g fill="var(--scene-cloud)" stroke="var(--scene-energy-flow)" strokeWidth="2">
        <circle cx="393" cy="218" r="4" />
        <circle cx="439" cy="327" r="4" />
      </g>
    </svg>
  );
}
