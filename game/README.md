# Tornaris — versión online

Juego completo para 3–6 jugadores sobre Cloudflare Workers + Durable Objects.
Reglas: [`../docs/REGLAS_v3.md`](../docs/REGLAS_v3.md).

> El helper original (contador de partida física) sigue intacto en la raíz del
> repo. Este directorio es un proyecto aparte y no lo toca.

## Correr en local

```bash
npm install
npm run dev          # http://127.0.0.1:8787
```

Para probar con varios jugadores en la misma máquina, abre la segunda pestaña en
ventana privada — la identidad del jugador vive en `localStorage`.

## Regenerar contenido

Los CSV de `docs/` son la fuente de verdad del contenido. Tras editarlos:

```bash
npm run data         # docs/*.csv        -> public/js/shared/data.js
npm run assets       # ../assets/*       -> public/assets/*.webp  (requiere Pillow)
```

`data.js` es **generado** — no lo edites a mano. Las correcciones de reglas
acordadas en el playtest (Sombra Acechante, rename del evento #27, etc.) se
aplican dentro de `scripts/build-data.mjs`, para que los CSV sigan coincidiendo
con las cartas impresas.

## Desplegar

```bash
npx wrangler login
npm run deploy
```

Cabe en el plan gratuito: Workers (100k req/día) y Durable Objects con backend
SQLite, que es el único disponible sin pagar. Para usar tu dominio, añade una
ruta en el dashboard de Cloudflare.

## Estructura

```
src/worker.js              entrada: sirve el cliente y enruta /api/*
src/room.js                Durable Object: un objeto por sala
public/js/shared/data.js   contenido generado (personajes, monstruos, cartas)
public/js/shared/rules.js  constantes de reglas (economía, arcos, brackets)
public/js/net.js           conexión WebSocket con reconexión
public/js/main.js          UI
scripts/                   generadores de datos y assets
```

`public/js/shared/` lo importan **el cliente y el Worker**, así que existe una
sola copia de los datos: el navegador lo pide por HTTP y wrangler lo empaqueta
dentro del Worker.

## Probar el motor sin navegador

```bash
npm run sim          # 160 partidas: turnos, ruleta, casillas, redacción
npm run sim:combat   # 120 partidas completas con combates y torneo
```

`sim` verifica que la partida siempre termine en el torneo, que salgan
exactamente 10 monstruos sin repetir, que nadie quede con oro o maná negativo,
que el maná máximo suba +3 por las 3 transiciones de categoría, y que ninguna
casilla bloqueada sea elegible.

`sim:combat` además compra equipamiento, pelea mazmorras en grupo, resuelve
duelos de ring y corre el bracket hasta coronar campeón.

## Equipamientos

Los 42 diseños están clasificados en `public/js/shared/equipment-fx.js`:

| Tipo | Cuántos | Qué hace |
|---|---|---|
| `flat` | 6 | bonus fijo, se aplica solo |
| `auto` | 20 | se calcula del estado del combate |
| `manual` | 15 | pide una decisión → el jugador declara el bonus |
| `deferred` | 1 | efecto que depende de jugadas posteriores |

Las cartas `manual` piden el número al jugador, igual que en la mesa física.
Automatizar "intercambia un dado con otro jugador" sin una UI de selección sería
adivinar; esto mantiene el juego fluyendo sin inventar reglas.

Tres monstruos (**Polilla Gigante**, **Dragón Terrestre**, **Rey de los Cielos**)
tienen mecánicas que no se modelan: la mesa declara el resultado. Es preferible
a comparar contra una vida que no existe — la Polilla no tiene PV numéricos.

## Estado

- [x] Servidor de salas (crear, entrar, reconectar sin perder el asiento)
- [x] Contenido portado desde los CSV
- [x] Lobby con selección de personaje
- [x] Motor de turnos (carta día/noche, ruleta, voto secreto, resolución)
- [x] Tienda, torre, trabajo, descanso, eventos
- [x] Tablero interactivo, ruleta animada, voto secreto, rail de jugadores
- [x] Combate de mazmorra cooperativo, con habilidades de monstruo
- [x] Duelos PvP (ring, torre) con ventaja y desempate
- [x] Torneo final completo: orden por dado, conversión de oro, bracket 3–6, campeón
- [ ] Objetos de un solo uso (Poción, Portal, Cuervo…)
- [ ] Efectos de cartas de evento (hoy se muestran; se aplican a mano)
- [ ] Habilidades post-combate de monstruos (Basilisco, Musgo, Dullahan…)

El bucle completo funciona de punta a punta: **lobby → 10 monstruos → torneo →
campeón**, verificado en navegador y en simulación.

## Desplegar

Ya hay sesión iniciada de wrangler en esta máquina, así que:

```bash
npm run deploy
```

publica en `tornaris.<subdominio>.workers.dev`. No hay que crear nada en el
dashboard: el namespace de Durable Objects se provisiona solo desde
`wrangler.jsonc`, y la configuración usa DOs con backend SQLite, que es la
variante disponible en el plan gratuito.

Para usar un dominio propio, añade una ruta de Worker en el dashboard.

## Pendiente de diseño

El tablero trae los nombres de las casillas **pintados en el arte**, y la UI
dibuja encima su propia etiqueta (necesaria para marcar casillas bloqueadas y
para que el texto no salga rotado). Se ven duplicados. Dos salidas:

1. Quitar las etiquetas de la UI y confiar en el arte — más limpio, pero el
   texto pintado aparece rotado o al revés en la mitad de las casillas.
2. Re-exportar el tablero **sin** los nombres, y que la UI ponga todas las
   etiquetas. Es la opción que mejor se ve, pero requiere tocar el arte.
