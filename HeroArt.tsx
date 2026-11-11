import { Icon } from "./Icon";

// Decorative illustration: a scrutineer's phone recording offline, plus live team widgets. All figures are made up.
export function HeroArt() {
  return (
    <div className="ha" aria-hidden="true">
      <span className="ha-blob b1" /><span className="ha-blob b2" />
      <div className="ha-phone">
        <div className="ha-notch" />
        <div className="ha-screen">
          <div className="ha-st"><span>Polling place 14</span><span className="ha-off"><Icon name="offline" />Offline</span></div>
          <p className="ha-h">Record tally</p>
          {[["Candidate A", 412, 78], ["Candidate B", 268, 51], ["Candidate C", 133, 25]].map(([n, v, w]) => (
            <div className="ha-cand" key={n as string}>
              <div><b>{n}</b><span>{v}</span></div>
              <i><u style={{ width: `${w}%` }} /></i>
            </div>
          ))}
          <div className="ha-save">Save on this phone</div>
          <p className="ha-q"><Icon name="cloud" />3 saved, will sync automatically</p>
        </div>
      </div>
      <div className="ha-card c1">
        <small>Team total</small>
        <b>14,280</b>
        <svg viewBox="0 0 120 36" className="ha-spark"><defs><linearGradient id="hg" x1="0" x2="1"><stop offset="0" stopColor="#ffd60a" /><stop offset=".55" stopColor="#ff8a00" /><stop offset="1" stopColor="#ef233c" /></linearGradient></defs><path d="M2 30 C14 28 20 22 30 24 S48 14 60 16 82 8 96 10 110 4 118 3" fill="none" stroke="url(#hg)" strokeWidth="3" strokeLinecap="round" /></svg>
        <em>+8.4% this hour</em>
      </div>
      <div className="ha-card c2">
        <svg viewBox="0 0 44 44" className="ha-ring"><circle cx="22" cy="22" r="17" fill="none" stroke="currentColor" strokeOpacity=".14" strokeWidth="5" /><circle cx="22" cy="22" r="17" fill="none" stroke="#3de3fb" strokeWidth="5" strokeLinecap="round" strokeDasharray="73 107" transform="rotate(-90 22 22)" /></svg>
        <div><b>68%</b><small>places reported</small></div>
      </div>
      <div className="ha-chip"><Icon name="check" />Synced just now</div>
    </div>
  );
}
