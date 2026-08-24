(function () {
  'use strict';

  const PHOTOS = {};
  let manifestLoaded = false;

  async function loadPhotoManifest() {
    if (manifestLoaded) return PHOTOS;
    try {
      const res = await fetch('assets/data/player-photo-manifest.json');
      if (res.ok) {
        const data = await res.json();
        Object.assign(PHOTOS, data.photos || {});
      }
    } catch (e) { /* ignore */ }
    manifestLoaded = true;
    return PHOTOS;
  }

  function playerPhotoKey(p) {
    if (!p) return '';
    return `${p.teamId || ''}:${p.name || ''}`;
  }

  function resolvePlayerPhoto(p) {
    if (!p) return '';
    const key = playerPhotoKey(p);
    if (PHOTOS[key]) return PHOTOS[key];
    if (!manifestLoaded && p.photo) return p.photo;
    return '';
  }

  function headshotStyle(p, size) {
    const url = resolvePlayerPhoto(p);
    const s = size || 32;
    if (!url) return '';
    return `width:${s}px;height:${s}px;background-image:url('${url.replace(/'/g, "%27")}');background-size:cover;background-position:center;`;
  }

  function headshotHtml(p, size, className) {
    const s = size || 32;
    const cls = className || 'bp-headshot';
    const style = headshotStyle(p, s);
    if (style) return `<div class="${cls}" style="${style}"></div>`;
    const initial = ((p && p.name) || '?').slice(0, 1).toUpperCase();
    const bg = (window.CS2 && window.CS2.teamMeta && p && p.teamId)
      ? (window.CS2.teamMeta(p.teamId).color || '#334155') : '#334155';
    return `<div class="${cls}" style="width:${s}px;height:${s}px;background:linear-gradient(145deg,${bg},#111827);display:flex;align-items:center;justify-content:center;font-size:${Math.round(s * 0.42)}px;font-weight:800;color:#fff;">${initial}</div>`;
  }

  window.CS2_HEADSHOTS = {
    loadPhotoManifest,
    playerPhotoKey,
    resolvePlayerPhoto,
    headshotStyle,
    headshotHtml
  };
})();
