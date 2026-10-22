// ESPN's own NBA clips (R7, Darren 22 Oct 2026): the game summary lists 6–19 short play clips per game, live too,
// each with a real 9:16 stream. They play in the same full-screen player as football's goals (reel.js), from the
// stickers on the Clips tab and on match pages (23 Oct 2026: the older inline player at the bottom of NBA match
// pages was slower and didn't autoplay reliably, while football's was fine).

// iPhone plays HLS itself, so it gets the small vertical stream. Desktop browsers that can't get the plain MP4,
// which is far bigger: fine for testing on the Mac.
const HLS = !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl');

// Straight to the 720p vertical stream (406×720, ~1.5 Mbps), skipping the master playlist and its captions list:
// two fewer round trips before the first frame (checked on 43 clips from 5 games, 23 Oct 2026: every one has it).
// If it's ever missing, the player falls back to the master playlist (masterOf).
const FAST = '/index-f3-v1-a1.m3u8';
const fast = (u) => (/\/9x16\/.+\/playlist\.m3u8$/.test(u) ? u.replace(/\/playlist\.m3u8$/, FAST) : u);
export const masterOf = (u) => (u?.endsWith(FAST) ? u.slice(0, -FAST.length) + '/playlist.m3u8' : '');

// The clips of a game, in the order they happened; a full recap (over 45 s) goes first.
export function clipList(d) {
  const out = (d?.videos || []).map((v) => {
    const s = v.links?.source || {};
    const src = HLS ? fast(s.HLS?.['9x16']?.href || s.HLS?.href || '') : s.href;
    return src && { id: v.id, title: v.headline || '', dur: v.duration || 0, src, tall: HLS && !!s.HLS?.['9x16'], poster: v.thumbnail || '', t: v.originalPublishDate || '' };
  }).filter(Boolean);
  out.sort((a, b) => ((b.dur > 45) - (a.dur > 45)) || a.t.localeCompare(b.t));
  return out;
}
