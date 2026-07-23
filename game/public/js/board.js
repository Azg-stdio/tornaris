// Board geometry and rendering.
//
// The 8 tiles sit on a circle. Rather than hit-test the artwork, each tile gets
// a hotspot positioned in polar coordinates over the image, so everything scales
// with the board and stays tappable on a phone.
//
// Angles are compass degrees: 0 = 12 o'clock, increasing clockwise. They were
// read off the printed board — each of the 4 arcs spans 90deg and is split into
// a day half (counter-clockwise) and a night half (clockwise).

import { TILE_LABELS, ARCS } from '/js/shared/rules.js';

export const TILE_ANGLE = {
  // norte arc
  mazmorra: 337.5,
  descanso: 22.5,
  // este arc
  tienda: 67.5,
  trabajo: 112.5,
  // sur arc (evento appears in both phases, at different halves)
  'evento:night': 157.5,
  'evento:day': 202.5,
  // oeste arc
  torre: 247.5,
  ring: 292.5,
};

export function tileAngle(tile, phase) {
  if (tile === 'evento') return TILE_ANGLE[`evento:${phase}`];
  return TILE_ANGLE[tile];
}

/** Centre angle of an arc, for the roulette needle. */
export function arcAngle(arcId, phase) {
  const arc = ARCS.find((a) => a.id === arcId);
  if (!arc) return 0;
  return tileAngle(phase === 'day' ? arc.day : arc.night, phase);
}

// Fraction of board width from centre to tile centre. Measured against the
// rendered artwork so the hotspots land on the painted tiles rather than
// inside the coliseum ring.
const RADIUS = 0.435;

function place(el, angleDeg, radius = RADIUS) {
  el.style.setProperty('--a', `${angleDeg}deg`);
  el.style.setProperty('--r', radius);
}

/**
 * Renders the tile hotspots for the current phase.
 * `onPick` fires with the tile id; disabled tiles are shown but not clickable.
 */
export function renderHotspots(root, { phase, tiles, blockedTiles, myChoice, votes, onPick }) {
  root.replaceChildren(
    ...[...tiles, ...blockedTiles].map((tile) => {
      const blocked = blockedTiles.includes(tile);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hotspot';
      btn.classList.toggle('is-blocked', blocked);
      btn.classList.toggle('is-mine', myChoice === tile);
      btn.disabled = blocked || !onPick;
      place(btn, tileAngle(tile, phase));

      const label = document.createElement('span');
      label.className = 'hotspot__label';
      label.textContent = TILE_LABELS[tile];
      btn.append(label);

      // After the reveal, show who landed here.
      const here = votes?.[tile] ?? [];
      if (here.length) {
        const stack = document.createElement('span');
        stack.className = 'hotspot__stack';
        for (const p of here) {
          const dot = document.createElement('i');
          dot.style.background = p.color;
          dot.title = p.name;
          stack.append(dot);
        }
        btn.append(stack);
      }

      if (blocked) {
        const bar = document.createElement('span');
        bar.className = 'hotspot__bar';
        btn.append(bar);
      }

      if (onPick && !blocked) btn.addEventListener('click', () => onPick(tile));
      return btn;
    }),
  );
}

/** Sweeps the roulette overlay to the blocked arc. */
export function renderRoulette(root, { blockedArc, phase, spinning }) {
  let needle = root.querySelector('.roulette');
  if (!needle) {
    needle = document.createElement('div');
    needle.className = 'roulette';
    needle.innerHTML = '<span class="roulette__wedge"></span>';
    root.append(needle);
  }
  needle.classList.toggle('is-spinning', Boolean(spinning));
  if (blockedArc) {
    // Extra turns make the landing feel like a spin rather than a snap.
    const angle = arcAngle(blockedArc, phase);
    needle.style.setProperty('--spin', `${360 * 3 + angle}deg`);
    needle.classList.add('is-landed');
  } else {
    needle.classList.remove('is-landed');
    needle.style.removeProperty('--spin');
  }
}
