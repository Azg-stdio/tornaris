# Tornaris — Especificación de Reglas v3

> **Estado:** Spec de trabajo para la versión digital. Respuestas del playtest ya integradas.
> Las secciones marcadas **🆕** son cambios posteriores al manual v2.
> Quedan **3 preguntas abiertas** al final — solo la primera bloquea el motor.

---

## 1. Objetivo

Convertirte en el Campeón de Tornaris ganando el torneo eliminatorio final. Durante la partida exploras, derrotas monstruos, acumulas oro y equipamiento para llegar al torneo lo más fuerte posible.

**Jugadores:** 3–6 · **Duración:** 60–120 min

---

## 2. Componentes

| Componente | Cantidad |
|---|---|
| Tablero circular | 1 (8 casillas en 4 arcos) |
| Cartas de personaje | 6 |
| Mazo de equipamientos | 42 diseños distintos (~85 cartas físicas) |
| Mazo de monstruos | 20 cartas (5 por categoría) |
| Mazo de día/noche | 50 cartas (30 día + 20 noche) |
| Mazo de eventos de día | 30 cartas |
| Mazo de eventos de noche | 24 cartas — ver ❓P3 |
| Mazo de objetos | 24 cartas (6 tipos) |
| **🆕 Ruleta** | 1 |

**🆕 En digital no existen las flechas.** El voto secreto se hace haciendo clic en la casilla; se revela simultáneamente. Skull tampoco necesita 2 flechas.

---

## 3. Preparación

1. Repartir los 6 personajes al azar. Cada jugador recibe sus **2 objetos iniciales**.
2. Cada jugador recibe **8 de oro**.
3. Maná base: **4** (Celeste/Druida: **5**).
4. **🆕 Mazo de monstruos (10 cartas):** selección aleatoria de **2** Duendes, **2** Ogros, **3** Gólems, **3** Dragones. Se apilan en orden: **Duende → Ogro → Gólem → Dragón**.
   - El campo "Jugadores mínimos" de las cartas **no filtra nada** — es irrelevante, el mínimo real de partida es 3.
5. Barajar por separado: equipamientos, eventos de día, eventos de noche, mazo de día/noche, objetos.
6. El jugador más joven recibe el token de turno.

---

## 4. Duración de la partida

**🆕 La partida dura 10 monstruos.** Al agotarse la última carta de monstruo comienza el **Torneo Final**.

⚠️ **Las cartas de día/noche NO alternan.** Se roba 1 carta del mazo de 50 por turno y puede salir día o noche — puede haber varios días seguidos o varias noches seguidas. El número total de turnos es por tanto **variable** (aprox. 16–18 con la proporción 30/20).

**El monstruo se renueva cada vez que se pasa a día.** → ver ❓P1, es el único punto que falta cerrar.

---

## 5. El Tablero

8 casillas repartidas en **4 arcos**. Cada arco contiene **una casilla de día y una de noche**:

| Arco | Casilla de Día | Casilla de Noche |
|---|---|---|
| Superior | **Mazmorra** | **Descanso** |
| Derecho | **Tienda** | **Trabajo** |
| Inferior | **Evento** | **Evento** |
| Izquierdo | **Torre** | **Apuestas** (el "pit de peleas") |

En el centro está el **Coliseo**, sede del Torneo Final.

### Casillas de Día

| Casilla | Efecto |
|---|---|
| **Mazmorra** | Enfrenta al monstruo activo junto a quienes lleguen. Si llegas solo: intenta el combate **o** toma carta de evento. |
| **Tienda** | Compra equipamientos (se revela 1 por jugador). Se elige en orden de turno. |
| **Torre** | Genera 4 de oro/turno a su dueño. Sin dueño y con varios llegando: los 2 primeros por orden de turno pelean. Bloqueada 2 turnos tras conquista. Quienes no participen toman carta de evento. |
| **Evento** | Roba del mazo de eventos de día. |

### Casillas de Noche

| Casilla | Efecto |
|---|---|
| **Descanso** | Recuperas todo tu maná. |
| **Trabajo** | Ganas 5 de oro. |
| **Apuestas** | Los 2 primeros por orden de turno se enfrentan en duelo. **🆕 Ganador: 12 de oro** (era 10). Si llega 1 solo: 3 de oro. El resto toma carta de evento. |
| **Evento** | Roba del mazo de eventos de noche. |

---

## 6. 🆕 La Ruleta

Al inicio del turno, **el dueño del token gira la ruleta**. La ruleta es un círculo con una división que deja 4 sectores, alineados con los 4 arcos del tablero.

**Bloquea un arco completo** — es decir, la casilla de día **y** la casilla de noche de ese arco. Un solo giro cubre ambas fases.

Reglas:
- Se gira **al inicio del turno**, antes de que nadie elija. El bloqueo es **visible para todos** → quedan 3 opciones.
- **Nadie puede esquivar el bloqueo.** Ni la libertad de elección de Skull ni el **Portal de Bolsillo** permiten entrar a una casilla bloqueada.
- Si la ruleta bloquea la **Mazmorra**, la carta de monstruo **se descarta** (igual que "Mazmorra Cerrada"). Esto **no alarga la partida**: sigue habiendo 10 monstruos y se consumen igual.
- El bloqueo de la ruleta **se acumula** con el de las cartas de día/noche. Si sale "Mazmorra Cerrada" y la ruleta también cae en Mazmorra, simplemente quedan **2 opciones**. No se vuelve a girar.

> **Variante pendiente de probar:** en vez de girar al azar, que el dueño del token **elija** qué arco bloquear. Convierte el token de turno en una decisión táctica real. Vale la pena implementarla como opción de partida.

---

## 7. Estructura del Turno

1. Revelar carta de **día/noche** y aplicar su efecto.
2. **🆕 El dueño del token gira la ruleta** → se bloquea 1 arco (día + noche).
3. Si es día: revelar equipamientos de tienda (1 por jugador) y el monstruo activo.
4. Cada jugador elige **en secreto** su casilla. Se revelan **simultáneamente**.
5. Resolver acciones en **orden de turno**. Las mazmorras **siempre al final**.
6. Pasar el token al siguiente jugador **a la derecha**.

---

## 8. Maná

- Recurso para activar equipamientos en combate.
- Se recupera **descansando de noche** o con la **Poción de Maná**.
- **El maná máximo aumenta +1 permanente para todos** en cada transición de categoría (Duende→Ogro, Ogro→Gólem, Gólem→Dragón) = **+3 a lo largo de la partida**.
- También puede aumentar por ciertos eventos y monstruos.
- Sin maná suficiente, no puedes activar el equipamiento.

---

## 9. Equipamientos

- Se compran en la tienda. **Máximo 6 en mano** (Braulia: **8**).
- Se activan **una vez por combate** gastando maná. Se recargan al inicio de cada nuevo combate.
- Se venden en cualquier momento por **la mitad** de su precio.
- Si el inventario está lleno, debes vender o descartar antes de comprar.
- Algunos tienen efecto alternativo de mazmorra, indicado con «**Mazmorra:**».
- Los no comprados van al descarte. Al agotarse el mazo, se baraja el descarte.

---

## 10. Combates

### 10.1 Mazmorra (cooperativo)

1. Participan todos los que eligieron la mazmorra.
2. Cada combatiente lanza **2 dados**.
3. Se suman todos los resultados en un **total grupal**.
4. El total debe **superar** la vida del monstruo. Vida = `Nx`, donde **N = jugadores en mesa** (no solo combatientes).
5. Se usan equipamientos **en orden de turno** para subir el total.
6. **Victoria:** todos los combatientes reciben la recompensa. **Derrota:** todos sufren la penitencia.

> **Ejemplo:** 4 jugadores en mesa. Troll (8x = 32). Van Ana y Carlos.
> Ana 4+5=9 | Carlos 3+6=9 → 18. Ana: Comodín (2 maná) → dado extra 5 → 23; Mazo (+2) y Escudito (+1) → 28.
> Carlos: Cota de Piedra (+5) → 31; Espadita (+1) → **32. ¡Victoria!**
> Habilidad del Troll: el dado más bajo (3 de Carlos) no recibe recompensa.

### 10.2 PvP

Ocurre en: **Apuestas, Torre, eventos, Guante del Duelo y Torneo Final**.

**Ventaja:** orden de turno normal durante la partida; orden del torneo en el Torneo Final. Con empate en el total inicial, **el jugador sin prioridad actúa primero**.

1. Ambos lanzan **2 dados**.
2. El que va perdiendo puede jugar equipamientos (gastando maná) para superar al rival.
3. Si lo supera, el otro pasa a ir perdiendo y puede responder.
4. Se alternan hasta que uno no pueda o no quiera responder.
5. Empate final → lanzamiento de dados **sin equipamientos**.

---

## 11. Objetos

Un solo uso. No ocupan espacio de equipamiento ni gastan maná.

| Objeto | Efecto |
|---|---|
| Invocación de Familiar | En mazmorra: lanza 2 dados adicionales ese combate. |
| Portal de Bolsillo | Tras revelar: cambia de casilla (no a una bloqueada). |
| Cuervo Mensajero | Tras revelar: compra 1 equipamiento de tienda sin estar ahí. |
| Cristal Vidente | Antes de revelar: todos muestran su elección antes que tú. |
| Guante del Duelo | En misma casilla que otro jugador: rétalo a duelo inmediato. |
| Poción de Maná | Fuera de combate: recupera todo tu maná. |

---

## 12. La Torre

Genera **4 de oro/turno** a su dueño. Tras una conquista queda **bloqueada 2 turnos**. Después, cualquiera puede disputarla en duelo PvP; si el retador gana, toma la torre y el bloqueo se reinicia.

---

## 13. Personajes

**🆕 Nyra es canónica** (el "Zelrac / Cazador" del manual v2 queda descartado).

| Personaje | Clase | Pasiva | Objetos iniciales | Maná |
|---|---|---|---|---|
| **Celeste** | Druida | Empieza con 1 de maná adicional permanente. | 2x Poción de Maná | 5 |
| **Skull** | Nigromante | Al entrar a cualquier combate toma 1 equipamiento aleatorio del descarte (si existe); lo devuelve al terminar.<br>**🆕 Recupera 2 de maná automáticamente al inicio de cada noche**, sin importar la casilla que elija. | 2x Portal de Bolsillo | 4 |
| **Remi** | Hombre Topo | Compras en tienda cuestan 2 menos. Al sacar un 6 en cualquier lanzamiento gana 3 de oro. | 2x Cuervo Mensajero | 4 |
| **Baltazar** | Mago | Una vez por combate puede repetir uno de sus dados. | 2x Cristal Vidente | 4 |
| **Braulia** | Escudera | 8 espacios de equipamiento en vez de 6. | 2x Invocación de Familiar | 4 |
| **Nyra** | Cazadora | Al ganar un combate contra un jugador le roba 7 de oro (adicional si hay otra recompensa). | 2x Guante del Duelo | 4 |

---

## 14. Monstruos

Vida `Nx` = N × jugadores **en mesa**.

### Duendes
| # | Nombre | Vida | Recompensa | Habilidad | Penitencia |
|---|---|---|---|---|---|
| 1 | Grumo | 3x | 5 oro | El primer combatiente lanza un dado; se suma a la vida del monstruo. | 2 oro |
| 2 | Diablillo | 4x | 1 equip. | Todos repiten su dado más alto una vez. | 3 oro |
| 3 | Mímico | 4x | 10 oro | El monstruo gana automáticamente si van TODOS los jugadores. | 4 oro |
| 4 | Sirena | 5x | 1 equip. | Si es derrotada, los que no participaron pierden 2 oro. | 3 oro |
| 5 | Esqueleto Guerrero | 5x | 1 equip. | Si el grupo falla, reaparece el siguiente turno con la misma vida. | 2 oro |

### Ogros
| # | Nombre | Vida | Recompensa | Habilidad | Penitencia |
|---|---|---|---|---|---|
| 6 | Troll | 8x | 1 equip. + 5 oro | El combatiente con el dado más bajo no recibe recompensa. | 4 oro |
| 7 | **Sombra Acechante** | 5x | 1 equip. + 3 oro | **🆕 El monstruo lanza automáticamente 2 dados por cada combatiente y ese total se suma a su vida.** Ningún jugador lo controla; recompensa y penitencia normales para todos. | 4 oro + descarta 1 equip. |
| 8 | Bruja | 8x | 1 equip. | No se pueden usar equipamientos, pero cada combatiente lanza 3 dados. | 4 oro |
| 9 | Hongo Alien | 6x | 1 equip. | Al ser derrotado, cada combatiente lanza un dado y gana ese oro. | Cada combatiente lanza un dado y pierde ese oro. |
| 10 | Horda Zombie | 4x | 2 equip. + 8 oro | +3 de vida por cada jugador que no participe. | 5 oro |

### Gólems
| # | Nombre | Vida | Recompensa | Habilidad | Penitencia |
|---|---|---|---|---|---|
| 11 | Basilisco de Fuego | 7x | 2 equip. + 8 oro | El de total más bajo es forzado a descansar la noche siguiente. | 4 oro |
| 12 | Cocatriz | 7x | 2 equip. + 10 oro | Cualquiera con total 8 o menos no recibe recompensa. | 5 oro |
| 13 | Musgo Viviente | 7x | 2 equip. + 10 oro | Tras el combate, el mejor lanzador recibe 2 monedas de cada combatiente. | 6 oro |
| 14 | Dullahan | 8x | 2 equip. + 12 oro | Si es derrotado, el jugador con más oro pierde 10 monedas. | 6 oro |
| 15 | Rey Nigromante | 8x | 2 equip. + 12 oro | Al ser derrotado, deben derrotarlo de nuevo con vida 5× por combatiente y sin equipamientos. | Descarta 1 equip. |

### Dragones
| # | Nombre | Vida | Recompensa | Habilidad | Penitencia |
|---|---|---|---|---|---|
| 16 | Polilla Gigante | Especial | 2 equip. + 14 oro | Cada combatiente elige en secreto ayudar a la Polilla o al grupo. Cada bando suma sus dados; el mayor total gana. Con 1 solo jugador, toma carta de evento en vez de pelear. Empate → gana el monstruo. | 10 oro |
| 17 | Gigante de Hielo | 7x | 3 equip. + 15 oro | Todos empiezan con **1 en ambos dados** y solo pueden modificarlos con **equipamientos**. *(Se mantiene el texto original — el cambio a "efectos" queda descartado.)* | 6 oro y el peor lanzador descarta 1 equip. |
| 18 | Balrog "Señor Abisal" | 8x | 1 maná adicional | Para participar debes hacer una ofrenda. Lanza un dado: 1–3 sacrificas 1 equip. a elección, 4–6 sacrificas 15 oro. Si no puedes pagar, no participas. | 10 oro y el peor lanzador descarta 1 equip. |
| 19 | Dragón Terrestre | **15 fijo** | 1 maná adicional + 10 oro | Cada jugador debe vencerlo **individualmente**. | 10 oro y el peor lanzador pierde 1 maná máximo permanente |
| 20 | Rey de los Cielos | 10x | 1) 1 maná adicional 2) 3 equip. 3) 30 oro (en orden de apuesta) | Cada jugador apuesta oro en orden de turno (el oro apostado siempre se pierde). Si ganan, los premios se reparten de mayor a menor apuesta. En empate, comparten premio. | Los que no participen y el de menor apuesta pierden 2 equip. a elección. |

---

## 15. Cartas de Día / Noche (mazo de 50)

### Día (30 cartas)
| Nombre | Efecto | Rep. |
|---|---|---|
| Día Normal | Un día ordinario en el reino. | 8 |
| Feria del Gremio | Se revelan 2 cartas por jugador en la tienda. | 2 |
| Día de Tregua | Nadie puede iniciar duelos hoy. | 2 |
| Monstruo Legendario | El monstruo tiene el doble de vida pero otorga el doble de recompensa. | 2 |
| Día de Suerte | Todos eligen 1 objeto de su preferencia al inicio del día. | 2 |
| Mazmorra Cerrada | Nadie puede ir a la mazmorra. La carta de monstruo se descarta. | 2 |
| Doble Evento | Los jugadores en casilla de evento roban 2 cartas. | 3 |
| Mercado Negro | Los equipamientos en tienda cuestan la mitad. | 2 |
| Día de Caza | Los monstruos otorgan el doble de recompensa. | 2 |
| Torre en Disputa | Nadie puede cobrar ingresos de sus torres. | 1 |
| Día Caótico | El orden de turno se invierte hoy. | 1 |
| Día Transparente | Las elecciones son visibles. Se elige casilla en orden de turno. | 1 |
| Recuperación General | Todos recuperan todo su maná al inicio del día. | 2 |

### Noche (20 cartas)
| Nombre | Efecto | Rep. |
|---|---|---|
| Noche Normal | La oscuridad llega sin novedades. | 4 |
| Ingresos Extra | Los que trabajen ganan el doble de oro. | 3 |
| Competencia en el Ring | Pueden realizarse 2 peleas en Apuestas en vez de 1. | 2 |
| Descanso Obligatorio | Todos recuperan todo su maná. | 2 |
| Mercado Nocturno | La tienda reemplaza la casilla de "Trabajo". | 1 |
| Noche Tranquila | Apuestas está cerrada. Nadie puede iniciar duelos. | 1 |
| Noche de Caos | El orden de turno se invierte. | 1 |
| Bonanza | Todos reciben 5 de oro adicional al inicio de la noche. | 2 |
| Remate Nocturno | Todos pueden vender equipamientos por su precio completo. | 2 |
| Noche Mágica | Todos recuperan todo su maná al inicio de la noche. | 1 |
| El Oráculo | Se revela la próxima carta de monstruo. | 1 |

---

## 16. Eventos

Se importan desde `Eventos (Día).csv` (27 diseños) y `Eventos (Noche).csv` (24 diseños).

**Correcciones aplicadas:**
- Evento de día **#27** se renombra de "Portal de Bolsillo" a **"Cuervo Mensajero"** (su texto ya entregaba un Cuervo Mensajero).
- El cambio del "evento de isekai" queda descartado.

**Composición de mazos** — para llegar a la proporción 30/20 acordada:
- **Día → 30 cartas.** Los 27 diseños a 1x, y 3 de ellos a 2x. Propuesta: *Capitán Mercenario*, *Duelo al Amanecer*, *Sincronía*.
- **Noche → 24 cartas.** Los 24 diseños a 1x. Ver ❓P3.

---

## 17. Preparación para el Torneo

Comienza al agotarse la última carta de monstruo.

1. Todos lanzan un dado. El **mayor obtiene el primer puesto**; el orden continúa hacia la derecha.
2. Conversión de oro sobrante:

| Oro | Obtienes |
|---|---|
| 5 | 1 equipamiento aleatorio |
| 15 | 1 espacio de equipamiento adicional |
| 30 | 1 maná adicional |

---

## 18. El Torneo Final

Duelos eliminatorios PvP en el **Coliseo**. El **primer puesto tiene ventaja de bracket**. En cada duelo, el jugador con **turno anterior en el orden del torneo** tiene ventaja (gana empates; el rival juega primero).

| Jugadores | Bracket |
|---|---|
| **3** | Semifinal: los 2 sin primer puesto. Final: ganador vs 1º. |
| **4** | Semi 1: 1º vs el de su derecha. Semi 2: los otros dos. Final: ganadores. |
| **5** | Cuartos: los 4 sin 1º en parejas. Semi: los 2 ganadores. Final: ganador vs 1º. |
| **6** | Cuartos: 1º vs su derecha + los otros 4 en parejas. Semi: los 2 ganadores de las parejas. Final: ganador semi vs ganador del duelo del 1º. |

El ganador del último duelo es el **Campeón de Tornaris**.

---

## 19. Reglas Generales

- El oro **siempre es público**.
- Si debes perder más oro del que tienes, solo pierdes lo que tengas.
- Equipamientos no comprados van al descarte. Al agotarse el mazo, se baraja el descarte.
- Los equipamientos se recargan al inicio de cada combate nuevo.
- **Plaga** (equip. #31): cuesta 0 oro y 0 maná, da −2 al ataque propio y no puede descartarse ni venderse. **Al usarse pasa a la mano del rival al final del combate.** Entra en juego comprándola en la tienda por 0.

---

# ❓ Preguntas abiertas

**P1 — Renovación del monstruo (bloqueante).**
Como las cartas de día/noche no alternan, hay que precisar cuándo se renueva el monstruo. Dos lecturas de *"cada vez que cambia de día se renueva"*:
- **(a)** Cada carta de día revelada = monstruo nuevo. Con 30 cartas de día pero solo 10 monstruos, la partida termina al décimo día. Duración ≈ 16–17 turnos.
- **(b)** Solo al **transicionar** de noche a día. Días consecutivos comparten el mismo monstruo, y quien no lo mató puede reintentarlo al día siguiente.

Recomiendo **(a)**: es lo que dice la casilla de Mazmorra en el manual ("se renueva cada turno"), hace la duración predecible, y evita el caso raro de reintentar al mismo monstruo ya dañado. **(b)** es más interesante tácticamente pero alarga la partida de forma impredecible. ¿Cuál?

**P2 — ¿"Apuestas" o "Ring"?**
El tablero dice **Apuestas**; el manual v2 dice **Ring**, y una carta de noche se llama "Competencia en el **Ring**". Asumí que son la misma casilla y usé "Apuestas" (lo del tablero). ¿Confirmas, y unifico todos los textos a "Apuestas"?

**P3 — Eventos de noche.**
Hay **24 diseños** distintos pero el objetivo era **20 cartas**. Para llegar a 20 habría que **eliminar 4 diseños completos**. Mi recomendación es dejar el mazo en 24 (todos a 1x) y no borrar contenido bueno — la proporción sigue siendo mayor de día que de noche. Si prefieres 20 exactos, dime cuáles 4 cortar.

---

# 🎨 Notas de assets

**Ya disponible:**
- `assets/board-final.png` — tablero, 4000×4000
- `assets/img/monster_1..20.png` — los 20 monstruos
- `assets/classes/*.png` — las 6 tarjetas de clase completas (600×400)
- **🆕 `assets/tokens/*.png`** — 6 tokens circulares de personaje + 1 flecha, 512×512 con transparencia. Extraídos del PDF `Flechas_y_Tokens.pdf` y recortados en círculo.
- **🆕 `assets/portraits/*.png`** — los 6 retratos aislados (203×376), recortados de las tarjetas de clase.

**Colores de identidad por clase** (muestreados del borde de cada tarjeta) — para el color de cada jugador en la UI:

| Clase | Personaje | Color |
|---|---|---|
| Druida | Celeste | `#c55619` |
| Nigromante | Skull | `#101010` |
| Hombre Topo | Remi | `#a0611d` |
| Mago | Baltazar | `#1b6b89` |
| Escudera | Braulia | `#464646` |
| Cazadora | Nyra | `#1f5423` |

⚠️ **Druida y Hombre Topo comparten un naranja muy parecido** (`#c55619` vs `#a0611d`). En los tokens sí se distinguen bien (Druida = naranja, Hombre Topo = verde lima), así que conviene usar el **color del token**, no el de la tarjeta, para identificar jugadores.

**Problema detectado:** el tablero tiene un **triángulo negro en la esquina inferior derecha** — parece un error de transparencia al exportar. Habría que re-exportar con fondo transparente.

**Assets que aún faltan:**
- **Íconos de los 6 objetos** (Poción de Maná, Portal de Bolsillo, Cuervo Mensajero, Cristal Vidente, Invocación de Familiar, Guante del Duelo) — se usan constantemente y hoy solo serían texto. Es lo más necesario.
- **Arte de la ruleta** — se puede generar por CSS/SVG sobre el tablero, no es bloqueante.
- **Íconos de equipamiento** — 42 son muchos; alternativa: carta genérica con color por rango de precio.
- Las **flechas ya no hacen falta** (voto por clic), pero el token de flecha quedó extraído por si sirve de cursor o indicador de "elección confirmada".

**Idea de dirección visual:** el Coliseo del centro está vacío, lo cual es perfecto para lo que propones — al iniciar un combate, la cámara hace zoom al centro y la batalla se resuelve dentro del Coliseo, con los dados cayendo en la arena. Sirve igual para duelos PvP, mazmorras y el Torneo Final.
