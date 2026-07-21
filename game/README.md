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
node scripts/sim.mjs [semilla]
```

Juega 160 partidas completas (3–6 jugadores) con elecciones legales al azar y
verifica las invariantes: que la partida siempre termine en el torneo, que salgan
exactamente 10 monstruos sin repetir, que nadie quede con oro u maná negativo,
que el maná máximo suba +3 por las 3 transiciones de categoría, y que ninguna
casilla bloqueada sea elegible.

## Estado

- [x] Servidor de salas (crear, entrar, reconectar sin perder el asiento)
- [x] Contenido portado desde los CSV
- [x] Lobby con selección de personaje
- [x] Motor de turnos (carta día/noche, ruleta, voto secreto, resolución)
- [x] Tienda, torre, trabajo, descanso, eventos
- [ ] Tablero y UI de partida
- [ ] Combates (mazmorra y PvP) y torneo final
