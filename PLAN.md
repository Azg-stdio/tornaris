# Plan: Tornaris Companion Web App

## Context
Building a mobile-first companion app for the Tornaris board game (3–6 players). It helps track the game state, display digital monsters/events, run a duel counter, and auto-generate the final tournament bracket. Must persist state through page reloads via localStorage and auto-deploy to GitHub Pages via GitHub Actions on every push to `main`.

## Technology
- **Stack**: Vanilla HTML + CSS + JS (no framework, no build step)
- **Deploy**: GitHub Actions → GitHub Pages (auto on push to main)
- **Persistence**: `localStorage` key `'tornaris_state'`

---

## File Structure
```
tornaris/
├── index.html          ← single-page shell (all screens via JS show/hide)
├── style.css           ← all styles, CSS variables, sky animation
├── data.js             ← pure game data (characters, monsters, events, equipment)
├── app.js              ← all app logic in an IIFE
├── monster_1.png … monster_20.png  (already present)
└── .github/
    └── workflows/
        └── deploy.yml
```

---

## State Shape (`localStorage`)

```js
{
  phase: 'setup' | 'game' | 'duel' | 'tournament' | 'champion',
  previousPhase: 'game' | 'tournament',   // where to return after duel
  options: {
    digitalMonsters: bool,
    digitalEvents: bool,
    fullTracking: bool,
  },
  players: [{
    id: number, name: string, characterId: string,
    gold: number, mana: number, maxMana: number,
    equipment: number[],   // equipment IDs
  }],
  game: {
    currentDay: number,           // 1–12
    timeOfDay: 'day' | 'night',
    monsterDeck: number[],        // 12 monster IDs, built at game start
    monsterDeckIndex: number,     // current active monster
    monsterDefeated: bool,
    dayEventDeck: number[],       // 30 shuffled event IDs
    dayEventIndex: number,
    nightEventDeck: number[],     // 20 shuffled event IDs
    nightEventIndex: number,
    pendingNotifications: string[],
  },
  duel: {
    player1Id: number, player2Id: number,
    score1: number, score2: number,
    winnerId: number | null,
    matchId: string | null,
  },
  tournament: {
    phase: 'pre' | 'bracket' | 'champion',
    seeds: [{ playerId: number, seedRank: number | null }],
    rounds: [{
      name: string,
      matches: [{
        id: string,
        player1Id: number | null, player2Id: number | null,
        advantagePlayerId: number | null,
        winnerId: number | null,
        feedsFrom: [feed | null, feed | null],
      }]
    }],
    championId: number | null,
  }
}
```

---

## Screens & Key Behavior

### 1. Setup Screen
- 3 toggle switches: Monstruos Digitales, Eventos Digitales, Tracking Completo
- 3–6 player slots, each with name input + character `<select>`
  - Characters already chosen elsewhere are `disabled` in other selects
- "Agregar Jugador" hidden at 6 players; "Eliminar" disabled at 3 players
- "Comenzar Partida" enabled only when all slots have name + unique character
- `startGame()`: builds monster deck (shuffle each tier of 5, remove 2 → 3 per tier, concat Duende→Ogro→Gólem→Dragón = 12), builds event decks, initializes players (Celeste gets maxMana=5)

### 2. Game Screen
- **Fixed sky layer**: CSS transitions on `[data-time=day/night]`
  - Sun slides left→right on day; moon slides right on night; stars fade in/out
- **Header**: "DÍA X / 12" or "NOCHE X / 12"
- **Event card**: shows event name + effect text
- **Monster section** (only if `digitalMonsters && timeOfDay==='day'`):
  - `monster_N.png` + name + tier badge + computed HP + ability + reward + penalty
  - HP formula: `'3x'` → `3 × playerCount`; fixed number → as-is; `null` → "Especial"
  - "Monstruo Legendario": HP × 2
  - "Mazmorra Cerrada": hide monster, auto-set monsterDefeated=true
- **Player cards** (horizontal scroll, snap):
  - Basic: name + character emoji + class badge
  - Full tracking: + gold (±1 hold-to-repeat), mana tokens (tappable circles), equipment chips (×remove)
- **Floating ⚔ button**: opens duel
- **Advance button**: Day→Night, Night→Day+1, Night 12→Tournament

### 3. Duel Screen
- Two `<select>` dropdowns (each excludes the other's choice)
- Fighter panels: Score display + `+` / `−` buttons (hold-to-repeat)
- **No dice rolls** — scores are entered manually
- "Declarar Ganador": highlights higher scorer
  - If `fullTracking && winner is Nyra` → prompt gold steal
- "Reiniciar": reset both scores to 0
- "← Volver": back to `previousPhase`

### 4. Tournament Screen

**Pre phase**:
- Gold conversion table (if fullTracking)
- "🔀 Aleatorizar Orden" → randomly shuffles seeding order
- "Generar Bracket" → `generateBracket()`

**Bracket phase** (per player count):
- 3p: Semi (s2 vs s3) → Final (s1 vs winner)
- 4p: Semi1 (s1 vs s4) + Semi2 (s2 vs s3) → Final
- 5p: QF (s4vs5) → Semi → Final (s1 vs semi winner)
- 6p: QF1(s1vs2) + QF2(s3vs4) + QF3(s5vs6) → Semi(QF2w vs QF3w) → Final(QF1w vs semiwinner)
- "⚔️ Pelear" → opens duel with matchId; winner auto-propagates to next round

**Champion phase**: confetti, winner banner, "Nueva Partida"

---

## CSS Architecture
- `--sky-day-top/bottom`, `--sky-night-top/bottom` → gradient transitions
- `--color-surface`: `rgba(255,255,255,0.12)` → glassmorphism cards
- `--color-accent`: `#c9a84c` (gold), `--color-accent-mana`: `#7b5ea7` (purple)
- Mobile-first; landscape media query for compact layout

---

## GitHub Actions Workflow
Auto-deploys on push to `main`. After first push, enable GitHub Pages in repo Settings → Pages → Source: "GitHub Actions".

---

## Implementation Notes
- No dice throws in the app (scores entered manually by players)
- Tournament seeding is randomized automatically by the app
- All state persists via `localStorage` with try/catch for private mode safety
- Score inputs are `contenteditable` divs sanitized to integers
