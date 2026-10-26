# Tornaris en Table World

Mesa virtual de Tornaris para Table World (motor estilo Tabletop Simulator).
Reglas: [`../docs/REGLAS_v3.md`](../docs/REGLAS_v3.md).

## Jugar

Una sola mesa para 3 a 6 jugadores: carga `tornaris.json` (`load_game` desde el agente, o desde la ventana).

1. Cada persona se sienta con el **+** que hay sobre un asiento (Asiento 1 … 6). Los asientos vacíos no juegan: el
   token los salta y no cuentan como jugadores (vida de los monstruos, tamaño de la tienda, cuadro del torneo).
2. Con 3 o más sentados, se pulsa **Empezar**: se reparten los personajes al azar, cada uno recibe su maná,
   espacios y 2 objetos iniciales, se arma el mazo de 10 monstruos (2 duendes, 2 ogros, 3 gólems, 3 dragones, de
   fácil a difícil) y se sortea quién empieza con el token. El primer turno es siempre un Día Normal, sin efecto. Desde el agente: `start_game` con `seats` o `players`.

Cada turno: carta de día/noche (su efecto se ve en el panel y se aplica) → la ruleta bloquea un arco → de día, la
tienda (1 carta por jugador, 2 en la Feria) en una columna junto a la casilla Tienda y el monstruo, en grande, en el centro del Coliseo → todos eligen casilla
**en secreto** → se revela todo a la vez → cada uno juega su casilla en orden → el dueño del token pulsa **Siguiente turno**.

### Tu tapete

Entre tu mano y el tablero tienes tu tapete. Lo que hay encima **es** tu partida, no una copia:

- **Personaje**: tu carta, tu **ficha** y, si te toca, el **token de turno**.
- **Oro**: monedas de oro (1) y de plata (5). Las reglas cobran y pagan con monedas y dan el cambio; diez de oro se
  cambian solas por dos de plata. También puedes pagar o pasar monedas con la mano.
- **Maná** y **Gastado**: gemas azules. Tu maná actual son las gemas de Maná; tu maná máximo, todas tus gemas.
  Jugar un equipamiento pasa gemas a Gastado; descansar o la Poción las devuelven; +1 de maná máximo es una gema nueva.
- **Combate**: un contador con tu total del combate (puedes escribir encima) y tus 3 dados de tu color.
- Debajo, los 6 huecos de equipamiento (8 de Braulia) te recuerdan cuántas cartas puede tener tu mano: el
  equipamiento sigue oculto en la mano, como dicen las reglas.

En las cuatro esquinas hay **bancos sin fondo** de monedas de oro, de plata y de gemas. Los paneles **Tú** y
**Jugadores** leen las piezas de los tapetes y se actualizan cuando alguien las mueve.

### Elegir casilla

Dos formas, que se pueden mezclar en el mismo turno:

1. **Con la ficha**: al empezar la elección comienza una **ronda a ciegas**. Arrastra tu ficha a una casilla del
   tablero; nadie más la ve. Cualquiera puede mover cualquier ficha (como en la mesa real). Cuando todos han
   colocado, quien tiene el token pulsa **Revelar casillas**. Las fichas se quedan donde las dejasteis hasta **Siguiente
   turno**. El día y la noche comparten arco: una ficha en la casilla de noche de un arco cuenta, de día, como la de
   día de ese arco (y al revés). Quien no eligió se queda sin casilla.
2. **Con el botón** **Elegir casilla** (secreto): el panel **Tu casilla** te la recuerda. Si todos usan el botón, se
   revela solo.

En el Día Transparente no hay ronda a ciegas: se elige a la vista, uno a uno.

La tienda está a la derecha del tablero, junto a la casilla Tienda (los mazos, a la izquierda): **Comprar equipamiento** pasa la carta a tu mano y cobra tus monedas
(Remi −2, Mercado Negro a mitad de precio, Mercado Nocturno desde Trabajo, Cuervo Mensajero desde cualquier casilla).

### Combates en la arena

El centro del tablero es la arena. Antes de pulsar **Combatir en la arena** (o **Retar a duelo**) puedes **lanzar
tus dados dentro de la arena**: la mesa usa esos. Si no, los tira por ti y pone tus dados en tu lado con esas caras.
La arena muestra la suma de los dados de cada uno. Cada **Jugar equipamiento** gasta tus gemas (si no te alcanzan, no
se juega) y deja la carta en tu lado de la arena; al **Resolver el combate** se reparten monedas, gemas y cartas, y
dados y cartas vuelven a su dueño. El **estandarte** de la Torre se planta en la casilla Torre con el color de su dueño.

## Regenerar

`tornaris.json` es **generado**: edita `build.mjs` (mesa, acciones, fases) o `tornaris.lua` (lógica) y ejecuta:

```bash
node tableworld/build.mjs                  # escribe tableworld/tornaris.json
node tableworld/build.mjs --install        # además la instala como «Tornaris» en la lista de juegos de Table World
python tableworld/tools/build_assets.py    # solo si cambian las imágenes de ../assets
```

El contenido de las cartas sale de `game/public/js/shared/data.js` (generado desde los CSV de `docs/`). Las cartas
de monstruo se dibujan con `tools/monster_cards.py` sobre el diseño de `assets/monstruo_new.psd` (fuente Bitter).

> El motor guarda la partida en curso dentro del archivo cargado. Para volver a una mesa limpia, regenera el archivo.

Esta versión (v2) usa lo que Table World trae ahora: asientos ocupados del propio motor (sin sala de espera),
acciones secretas con `reveal` y `$viewer.chose`, opciones con etiquetas (ids como `mazmorra`, texto «Mazmorra»),
`game.messages` para que el registro del motor hable en español, y zonas de disposición (`LayoutZone`) para la
tienda y para cada lado de la arena. Dos rodeos por fallos del motor, anotados en el código: `Game.getSeats()`
devuelve una lista vacía (se usa el recurso `en_juego`), y la disposición automática tras un `move` de las reglas
deja la última carta en el centro (se llama a `LayoutZone.layout()` desde Lua).

Las piezas físicas: la mesa mide 2,4 × 1,7 m y el tablero 0,8 m. El tapete (`assets/mat.png`) lo dibuja
`tools/mat.py`; sus secciones deben coincidir con `MAT` en `build.mjs`. En `tornaris.lua`, `R`/`addR`/`setR` leen y
mueven monedas, gemas y el contador para `oro`, `mana`, `mana_max` y `total`; los recursos con esos nombres solo
reflejan las piezas para los paneles. Las fichas sobre las casillas pasan por las zonas `casilla_<casilla>` (función
`colocar`).

## Qué hace la mesa y qué hacéis vosotros

La mesa hace poco a propósito: las cartas se leen en voz alta y cada jugador, en orden de turno, hace lo que dice su
casilla con las piezas.

**La mesa:**
- El reparto inicial (personaje, monedas, gemas, objetos, ficha) y el sorteo del token.
- **Siguiente turno** (solo quien tiene el token): las fichas vuelven a los tapetes, el token pasa, se descartan las
  cartas que quedaron en la tienda y el monstruo sin combatir, y se abre la carta de día o noche; de noche la sala se
  oscurece y se vuelve azul; la luz de la mesa no cambia, así que cartas y tablero se leen igual. De día se revela el monstruo y se llena la tienda (1 carta por jugador).
- La elección secreta (ficha en ronda a ciegas o botón) y **Revelar casillas** (quien tiene el token).
- **Comprar equipamiento**: cobra con tus monedas y da el cambio (Remi −2, Mercado Negro a mitad de precio).
- Los combates y duelos: tiradas (o tus dados lanzados en la arena), habilidades de los monstruos, gemas gastadas al
  **Jugar equipamiento**, recompensas y penitencias, robo de Nyra, 6 de Remi, la Torre ganada en duelo, el Torneo Final.

**Vosotros, a mano:**
- La ruleta (tiradla y respetad lo que bloquea) y el efecto de la carta de día o noche.
- Lo que da cada casilla: Trabajo, Descanso, Ring, Torre sin dueño (poned el estandarte), robar y leer eventos.
- Objetos, vender y descartar, +1 gema por cambio de categoría, sumar al contador lo que una carta pida.

## Interpretaciones (revisar)

- **Esqueleto Guerrero**: si reaparece, ese día no sale monstruo nuevo (la partida dura un día más).
- **Fin de partida**: el torneo empieza al inicio del turno siguiente al día del 10.º monstruo.
- **Monstruo sin combatir**: se descarta al terminar el turno.
- **Quién empieza**: la mesa no sabe quién es el más joven; sortea el token entre los jugadores.
- **«A la derecha»**: el token pasa en sentido antihorario visto desde arriba (asientos 1 → 6 → 5 → 4 → 3 → 2).
- **Recompensas de equipamiento** pueden superar tus espacios; descarta el exceso a mano.
