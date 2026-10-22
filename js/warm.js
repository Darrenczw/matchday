// Warming the video servers before a tap (Darren, 23 Oct 2026: NBA clips "slow and clunky, doesn't autoplay").
// Measured from SG: an ESPN clip nobody nearby has watched lately waits ~0.8 s for its playlist and up to 1.5 s for
// its first piece, so it took 2–3 s to start and the player's 4 s watchdog often showed a play button instead.
// Once anyone has asked for them, both come back in ~0.05 s. So the clips you're about to see are asked for
// quietly first: the playlist and its first two 2-second pieces (~350 KB a clip), and the still. Two at a time,
// the newest request first (it's the clip nearest your thumb). Nothing in Low Data Mode.
const done = new Set();
let todo = [], busy = 0;
const MAX = 2;
const saveData = () => !!navigator.connection?.saveData;

export function warm(clips) {
  if (saveData()) return;
  const fresh = clips.filter((c) => c?.src && !done.has(c.src));
  for (const c of fresh) {
    done.add(c.src);
    if (c.poster) new Image().src = c.poster;
  }
  // Only streams have small first pieces worth fetching; a plain MP4 starts from its own first bytes anyway.
  todo = [...fresh.filter((c) => /\.m3u8(\?|$)/.test(c.src)), ...todo];
  pump();
}

function pump() {
  while (busy < MAX && todo.length) {
    const c = todo.shift();
    busy++;
    one(c.src).catch(() => {}).finally(() => { busy--; pump(); });
  }
}
async function one(src) {
  const r = await fetch(src);
  if (!r.ok) return;
  const lines = (await r.text()).split('\n').map((x) => x.trim()).filter((x) => x && !x.startsWith('#'));
  // A master playlist lists other playlists; a media playlist lists the pieces. Warm only the pieces.
  if (lines[0]?.includes('.m3u8')) return;
  for (const p of lines.slice(0, 2)) await fetch(new URL(p, src)).then((x) => x.arrayBuffer());
}
