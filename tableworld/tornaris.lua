-- Tornaris rules logic (docs/REGLAS_v3.md). build.mjs prepends the data tables:
-- SEATS (turn order, all six), SEAT_N, HAND, PJZONE, MAT, BANCO, BANNER_REST, MONSTER_SCALE, ARENA_ZONE, TILES, TILE_CODE,
-- TILE_LABEL, MOTIVO, ARCS, DAY_TILES, NIGHT_TILES, PJ, EQ, OBJ, MON, CARTAS, TIER_LABEL.
-- Rule functions get ctx {actor, params, args, it}; returning a string refuses the action. Choice params arrive as
-- their option ids (mazmorra, ring, auto, ...), never as the Spanish labels players read.
-- Only the seats the game started with take part: see jugadores().

local M = 1 / 0.03 -- Table World Lua positions are TTS units (3 cm), table top at y = 0.96

local function V(n) return Game.getVariable(n) end
local function setV(n, v) Game.setVariable(n, v) end
local function log(t) Game.log(t) end
local function pos(x, z, y) return { x = x * M, y = y or 1.1, z = z * M } end

-- Physical pieces ----------------------------------------------------------------
-- Gold is the coins in the seat's Oro zone (gold 1, silver 5). Current mana is the gems in its Maná zone, and
-- maximum mana is those plus the spent gems in Gastado. The combat total is the counter on the mat. The rules
-- read and change them only through R / addR / setR below, so a player moving pieces by hand is the same as the
-- rules doing it. The resources of the same names only mirror them for the panels (refrescar).

local function piezas(zonaId, tag)
  local out = {}
  local z = getObjectFromGUID(zonaId)
  if not z then return out end
  for _, o in ipairs(z.getObjects()) do if o.hasTag(tag) then out[#out + 1] = o end end
  return out
end

local REJILLA = { oro = { 5, 5 }, mana = { 3, 4 }, gastado = { 3, 4 } } -- columns, rows per layer
-- Lays the pieces of one mat zone out in a grid (silver before gold), so they never pile up or spill.
local function ordenarZona(seat, k)
  local m = MAT[seat]
  local z = m[k]
  local lista = {}
  if k == 'oro' then
    for _, o in ipairs(piezas(z.zona, 'moneda5')) do lista[#lista + 1] = o end
    for _, o in ipairs(piezas(z.zona, 'moneda1')) do lista[#lista + 1] = o end
  else
    lista = piezas(z.zona, 'gema')
  end
  local cols, filas = REJILLA[k][1], REJILLA[k][2]
  for i, o in ipairs(lista) do
    local col, fila = (i - 1) % cols, math.floor((i - 1) / cols)
    local capa = math.floor(fila / filas)
    fila = fila % filas
    local lx = -z.s[1] / 2 + (col + 0.5) * z.s[1] / cols
    local lz = z.s[2] / 2 - (fila + 0.5) * z.s[2] / filas
    o.setPosition(pos(z.c[1] + lx * m.right[1] + lz * m.inn[1], z.c[2] + lx * m.right[2] + lz * m.inn[2], 1.0 + capa * 0.12))
    o.setRotation({ x = 0, y = m.face, z = 0 })
  end
end

local function sacarDelBanco(tipo, seat, k)
  local o = getObjectFromGUID(BANCO[tipo]).takeObject({ position = pos(MAT[seat][k].c[1], MAT[seat][k].c[2], 1.3) })
  return o
end

local function valorOro(seat)
  return #piezas(MAT[seat].oro.zona, 'moneda1') + 5 * #piezas(MAT[seat].oro.zona, 'moneda5')
end

-- Pays or receives gold with coins, making change from the bank. "Si debes perder más oro del que tienes, solo
-- pierdes lo que tengas."
local function cambiarOro(seat, d)
  d = math.floor(d + 0.5)
  if d > 0 then
    for _ = 1, math.floor(d / 5) do sacarDelBanco('plata', seat, 'oro') end
    for _ = 1, d % 5 do sacarDelBanco('oro', seat, 'oro') end
  elseif d < 0 then
    local falta = math.min(-d, valorOro(seat))
    local unos, cincos = piezas(MAT[seat].oro.zona, 'moneda1'), piezas(MAT[seat].oro.zona, 'moneda5')
    while falta > 0 and #unos > 0 do table.remove(unos).destruct() falta = falta - 1 end
    while falta > 0 and #cincos > 0 do
      table.remove(cincos).destruct()
      if falta < 5 then
        for _ = 1, 5 - falta do sacarDelBanco('oro', seat, 'oro') end
        falta = 0
      else
        falta = falta - 5
      end
    end
  end
  -- Ten gold coins become two silver ones.
  local unos = piezas(MAT[seat].oro.zona, 'moneda1')
  while #unos >= 10 do
    for _ = 1, 5 do table.remove(unos).destruct() end
    sacarDelBanco('plata', seat, 'oro')
  end
  ordenarZona(seat, 'oro')
end

local function manaActual(seat) return #piezas(MAT[seat].mana.zona, 'gema') end
local function manaMax(seat) return manaActual(seat) + #piezas(MAT[seat].gastado.zona, 'gema') end

-- Spending moves gems from Maná to Gastado; recovering moves them back.
local function moverGemas(seat, de, a, n)
  local lista = piezas(MAT[seat][de].zona, 'gema')
  for i = 1, math.min(n, #lista) do lista[i].setPosition(pos(MAT[seat][a].c[1], MAT[seat][a].c[2], 1.3)) end
  ordenarZona(seat, 'mana')
  ordenarZona(seat, 'gastado')
end

-- A new point of maximum mana is a new gem, ready to use; losing one takes a spent gem first.
local function cambiarManaMax(seat, d)
  if d > 0 then
    for _ = 1, d do sacarDelBanco('mana', seat, 'mana') end
  else
    for _ = 1, -d do
      local g = piezas(MAT[seat].gastado.zona, 'gema')[1] or piezas(MAT[seat].mana.zona, 'gema')[1]
      if g then g.destruct() end
    end
  end
  ordenarZona(seat, 'mana')
  ordenarZona(seat, 'gastado')
end

local function contador(seat) return getObjectFromGUID('total_' .. MAT[seat].n) end

local function R(seat, id)
  if id == 'oro' then return valorOro(seat) end
  if id == 'mana' then return manaActual(seat) end
  if id == 'mana_max' then return manaMax(seat) end
  if id == 'total' then return contador(seat).getValue() or 0 end
  return Game.getResource(seat, id)
end
local function addR(seat, id, d)
  if id == 'oro' then cambiarOro(seat, d)
  elseif id == 'mana' then
    if d < 0 then moverGemas(seat, 'mana', 'gastado', -d) else moverGemas(seat, 'gastado', 'mana', d) end
  elseif id == 'mana_max' then cambiarManaMax(seat, d)
  elseif id == 'total' then contador(seat).setValue(R(seat, 'total') + d)
  else Game.addResource(seat, id, d) end
end
local function setR(seat, id, v)
  if id == 'oro' or id == 'mana' or id == 'mana_max' or id == 'total' then addR(seat, id, v - R(seat, id))
  else Game.setResource(seat, id, v) end
end
-- Variables round-trip through JSON: a stored nil comes back as a JsonNull userdata.
local function limpiar(v)
  if type(v) == 'userdata' then return nil end
  if type(v) == 'table' then
    local t = {}
    for k, x in pairs(v) do t[k] = limpiar(x) end
    return t
  end
  return v
end
local function st() return limpiar(V('st')) or {} end
local function save(s) Game.setVariable('st', s) end

-- The seats in the game, in turn order. onGameStart marks them with 'en_juego' (Game.getSeats would be the
-- natural call, but this engine build returns it empty).
local function activo(seat) return R(seat, 'en_juego') == 1 end
local function jugadores()
  local o = {}
  for _, seat in ipairs(SEATS) do if activo(seat) then o[#o + 1] = seat end end
  return o
end
local function contiene(lista, x)
  for _, v in ipairs(lista) do if v == x then return true end end
  return false
end

local function pjDe(seat) local s = st() return s.pj and s.pj[seat] end
function nombre(seat)
  local pj = pjDe(seat)
  return pj and PJ[pj].nombre or ('Asiento ' .. SEAT_N[seat])
end
local function nombres(list)
  local o = {}
  for _, seat in ipairs(list) do o[#o + 1] = nombre(seat) end
  return table.concat(o, ', ')
end

local function recuperarMana(seat, n)
  local max = R(seat, 'mana_max')
  setR(seat, 'mana', n and math.min(max, R(seat, 'mana') + n) or max)
end

local function tirar(n)
  local d = Game.roll(n, 6)
  local out = {}
  for i = 1, n do out[i] = d[i] end
  return out
end
local function suma(d) local t = 0 for _, v in ipairs(d) do t = t + v end return t end
local function txtDados(d) return table.concat(d, ' + ') .. ' = ' .. suma(d) end
local function numero(txt) return tonumber((tostring(txt):match('[-+]?%d+'):gsub('^%+', ''))) end

-- Remi (Hombre Topo): 3 gold for every 6 he rolls.
local function bonoRemi(seat, dados)
  if pjDe(seat) ~= 'remi' then return end
  for _, v in ipairs(dados) do
    if v == 6 then addR(seat, 'oro', 3) log('Remi saca un 6: +3 de oro.') end
  end
end

-- Each seat has three dice in its colour (dado_<n>_1..3). A player can throw them into the arena before a combat;
-- otherwise the rules roll and set the dice to those faces in the arena, so the dice on the table always show the
-- numbers in play.
local function dado(seat, k) return getObjectFromGUID('dado_' .. MAT[seat].n .. '_' .. k) end
local function dadosEnArena(seat)
  local out = {}
  for _, o in ipairs(piezas('arena', 'owner:' .. seat)) do
    if o.hasTag('dado') and o.getValue() then out[#out + 1] = o.getValue() end
  end
  return out
end
local function dadosIniciales(seat, n)
  local fis = dadosEnArena(seat)
  if #fis >= n then
    local d = {}
    for i = 1, n do d[i] = fis[i] end
    log(nombre(seat) .. ' usa los dados que lanzó en la arena.')
    return d
  end
  return tirar(n)
end
local function mostrarDados(seat, d)
  for k = 1, 3 do
    local o = dado(seat, k)
    if o then
      local p = d[k] and MAT[seat].arena_dados[k] or MAT[seat].dados[k]
      o.setPosition(pos(p[1], p[2], 1.02))
      o.setRotation({ x = 0, y = 0, z = 0 })
      if d[k] then o.setValue(d[k]) end
    end
  end
end
-- After a combat every die goes back to its mat.
local function recogerDados()
  for _, seat in ipairs(SEATS) do mostrarDados(seat, {}) end
end

-- The turn token sits on the mat of the player who holds the turn.
local function moverToken()
  local t, seat = getObjectFromGUID('token_turno'), Game.getCurrentSeat()
  if t and seat and MAT[seat] then t.setPosition(pos(MAT[seat].token[1], MAT[seat].token[2])) end
end

local function moverFicha(seat, tile)
  local pj = pjDe(seat)
  if not pj then return end
  local f = getObjectFromGUID('ficha_' .. pj)
  if not f then return end
  if not tile then
    local h = MAT[seat].ficha
    f.setPosition(pos(h[1], h[2]))
    return
  end
  -- Several players on one tile sit around its centre, each in their own spot.
  local a = SEAT_N[seat] * 2 * math.pi / 6
  local t = TILES[tile]
  f.setPosition(pos(t[1] + math.cos(a) * 0.05, t[2] + math.sin(a) * 0.05))
end

local function idsEnZona(zoneId, pattern)
  local z = getObjectFromGUID(zoneId)
  local out = {}
  if not z then return out end
  for _, o in ipairs(z.getObjects()) do
    local id = o.getGUID()
    if id:match(pattern) then out[#out + 1] = id end
  end
  return out
end
local function eqNum(cardId) return tonumber(cardId:match('^eq_(%d+)_')) end
local function contarEquipo(seat) return #idsEnZona(HAND[seat], '^eq_') end
local function monstruoActivo()
  local ids = idsEnZona('monstruo_activo', '^m_%d+$')
  return ids[1] and tonumber(ids[1]:match('^m_(%d+)$')) or nil
end

-- Turn order for resolving, starting at the token holder; Día Caótico / Noche de Caos reverse it.
function orden()
  local js = jugadores()
  local cur, i0 = Game.getCurrentSeat(), 1
  for i, s in ipairs(js) do if s == cur then i0 = i end end
  local o = {}
  for k = 0, #js - 1 do o[#o + 1] = js[((i0 - 1 + k) % #js) + 1] end
  local c = V('carta')
  if c == 'caotico' or c == 'noche_caos' then
    local r = { o[1] }
    for k = #o, 2, -1 do r[#r + 1] = o[k] end
    o = r
  end
  return o
end

-- Panels ---------------------------------------------------------------------

-- The pieces are the truth; the resources of the same names mirror them (the rules and the log read them).
function refrescar(ctx)
  for _, seat in ipairs(jugadores()) do
    for _, id in ipairs({ 'oro', 'mana', 'mana_max', 'total' }) do Game.setResource(seat, id, R(seat, id)) end
  end
end

local function actualizarTorre()
  local d, b = V('torre_dueno'), V('torre_bloqueo')
  if d == '' then setV('torre_txt', 'Sin dueño')
  else setV('torre_txt', nombre(d) .. (b > 0 and (' (bloqueada ' .. b .. ' turno' .. (b > 1 and 's' or '') .. ')') or ' (se puede disputar)')) end
end
-- The Tower banner stands on the Torre space in its owner's colour.
local function moverEstandarte()
  local b, d = getObjectFromGUID('estandarte'), V('torre_dueno')
  if not b then return end
  if d == '' then
    b.setPosition(pos(BANNER_REST[1], BANNER_REST[2]))
    b.setColorTint({ r = 0.92, g = 0.92, b = 0.92 })
  else
    local c = MAT[d].color
    b.setPosition(pos(TILES.torre[1] - 0.035, TILES.torre[2] + 0.03))
    b.setColorTint({ r = c[1], g = c[2], b = c[3] })
  end
end

local function conquistar(seat)
  setV('torre_dueno', seat)
  setV('torre_bloqueo', 2)
  moverEstandarte()
  log(nombre(seat) .. ' conquista la Torre: +4 de oro por turno. Queda bloqueada 2 turnos.')
  actualizarTorre()
end

local function vidaBase(id)
  local m = MON[id]
  local v = 0
  if m.hp == 'perPlayer' then v = m.hpv * V('jugadores') elseif m.hp == 'fixed' then v = m.hpv end
  if V('carta') == 'legendario' then v = v * 2 end
  return v
end

local function enCombate(seat)
  local s = st()
  if V('combate') == 1 and s.comb then
    for _, c in ipairs(s.comb) do if c == seat then return 'mazmorra' end end
  end
  if s.duelo and (s.duelo.a == seat or s.duelo.b == seat) then return 'duelo' end
  return nil
end

local function recalcular()
  local s = st()
  if V('combate') == 1 and s.comb then
    local t, partes = 0, {}
    for _, seat in ipairs(s.comb) do
      t = t + R(seat, 'total')
      partes[#partes + 1] = nombre(seat) .. ' ' .. R(seat, 'total')
    end
    setV('combate_total', t)
    if monstruoActivo() == 19 then
      setV('combate_txt', table.concat(partes, ' · ') .. ' (cada uno contra ' .. V('vida') .. ')')
    else
      setV('combate_txt', 'Grupo ' .. t .. ' contra vida ' .. V('vida') .. ' (' .. table.concat(partes, ' · ') .. ')')
    end
  end
  if s.duelo then
    local a, b = s.duelo.a, s.duelo.b
    local ta, tb = R(a, 'total'), R(b, 'total')
    local pierde = ta < tb and nombre(a) or (tb < ta and nombre(b) or 'empate')
    setV('duelo_txt', nombre(a) .. ' ' .. ta .. ' contra ' .. tb .. ' ' .. nombre(b) .. '. Va perdiendo: ' .. pierde)
  end
  -- The battle line on screen: the combat or the duel in progress, empty otherwise.
  setV('batalla_txt', s.duelo and ('Duelo: ' .. V('duelo_txt')) or (V('combate') == 1 and ('Combate: ' .. V('combate_txt')) or ''))
end

-- Setup ------------------------------------------------------------------------

function preparar(ctx)
  local s = { pj = {}, elec = {}, dados = {} }
  local usados = {}
  local js = jugadores()
  setV('jugadores', #js)
  for _, seat in ipairs(js) do
    for _, id in ipairs(idsEnZona(PJZONE[seat], '^pj_')) do s.pj[seat] = id:match('^pj_(.+)$') end
    local pj = s.pj[seat]
    if pj then
      usados[pj] = true
      setR(seat, 'mana_max', PJ[pj].mana)
      setR(seat, 'espacios', PJ[pj].espacios)
      setR(seat, 'oro', 8)
      setR(seat, 'total', 0)
    end
  end
  save(s)
  for _, seat in ipairs(js) do
    local pj = s.pj[seat]
    if pj then
      moverFicha(seat)
      log(nombre(seat) .. ' (' .. PJ[pj].clase .. ') se sienta en el asiento ' .. SEAT_N[seat] .. ': ' .. PJ[pj].pasiva)
    end
  end
  for pj in pairs(PJ) do
    if not usados[pj] then
      local f = getObjectFromGUID('ficha_' .. pj)
      if f then f.destruct() end
    end
  end
  -- The engine draws who starts (turn.startingPlayer 'random').
  moverToken()
  moverEstandarte()
  log('Empieza la partida con ' .. #js .. ' jugadores. Cada uno tiene 8 de oro y sus 2 objetos iniciales. El token es para ' .. nombre(Game.getCurrentSeat()) .. '.')
  log('Los monstruos tienen vida N × ' .. #js .. '. Al cambiar de categoría (tras el 2.º, 4.º y 7.º monstruo), todos ganan +1 de maná máximo.')
end

-- Turn start -------------------------------------------------------------------

-- Night falls in the room only (dim and blue); the table light keeps cards and board readable. Day and the
-- tournament bring the room back to normal (intensity 1, no colour).
local LUZ = {
  dia = { intensity = 1 },
  noche = { intensity = 0.3, color = { 0.6, 0.7, 1 } },
  torneo = { intensity = 1 },
}
local function iluminar(momento)
  Lighting.setRoomLight(LUZ[momento])
end

-- The new day/night card. Its effect, the roulette, and what each space gives are read out and done by hand.
function amanecer(ctx)
  local s = st()
  s.elec, s.dados, s.comb, s.duelo, s.mimico, s.rey2 = {}, {}, nil, nil, nil, nil
  for _, seat in ipairs(SEATS) do
    setR(seat, 'pos', 0)
    setR(seat, 'total', 0)
    setR(seat, 'premio_eq', 0)
    setR(seat, 'lucha', 0)
  end
  save(s)
  setV('combate', 0)
  setV('combate_total', 0)
  setV('combate_txt', '-')
  setV('duelo_txt', '-')
  setV('batalla_txt', '')
  setV('elegidos', 0)
  setV('ronda', V('ronda') + 1)

  local fase, carta = V('fase'), V('carta')
  local c = CARTAS[carta] or { nombre = carta, texto = '' }
  setV('fase_txt', fase == 'dia' and '☀ Día' or '☾ Noche')
  setV('carta_txt', c.nombre)
  setV('carta_efecto', c.texto)
  iluminar(fase)

  -- The button offers today's half of the board.
  for _, t in ipairs(DAY_TILES) do setV('ok_' .. t, fase == 'dia' and 1 or 0) end
  for _, t in ipairs(NIGHT_TILES) do setV('ok_' .. t, fase == 'noche' and 1 or 0) end
  setV('elec_txt', carta == 'transparente' and 'Elegid casilla a la vista, en orden de turno.'
    or 'Elegid casilla: arrastrad vuestra ficha o pulsad «Elegir casilla».')
  if V('torre_bloqueo') > 0 then setV('torre_bloqueo', V('torre_bloqueo') - 1) end

  if fase == 'noche' then setV('monstruo', 'Ninguno: es de noche') end
  log('Turno ' .. V('ronda') .. ' · ' .. (fase == 'dia' and 'Día' or 'Noche') .. ': ' .. c.nombre .. '.')
  moverToken()
end

-- The shop and the arena sides are layout zones; the engine's own arrange after a rule move can leave the last
-- card in the zone's middle, so the rules ask for a layout once the cards are in.
function ordenar(ctx)
  local z = getObjectFromGUID(ctx.args.zona or ARENA_ZONE[ctx.actor])
  if z then z.LayoutZone.layout() end
end

function revelar_monstruo(ctx)
  local id = monstruoActivo()
  if not id then
    setV('monstruo', '-')
    return
  end
  -- Big enough to read from every seat while it is in play.
  local carta = getObjectFromGUID('m_' .. id)
  if carta then carta.setScale({ x = MONSTER_SCALE, y = 1, z = MONSTER_SCALE }) end
  local m, s = MON[id], st()
  if V('esqueleto') == 1 then
    setV('esqueleto', 0)
    log('¡El Esqueleto Guerrero reaparece con la misma vida!')
  elseif s.ultimo_tier and s.ultimo_tier ~= m.tier then
    -- A reminder only: each player takes their new gem from the bank.
    log('Llegan los monstruos de categoría ' .. TIER_LABEL[m.tier] .. ': todos cogen 1 gema de maná del banco (+1 de maná máximo).')
  end
  s.ultimo_tier = m.tier
  save(s)
  local doble = V('carta') == 'legendario' or V('carta') == 'caza'
  setV('monstruo', m.nombre)
  setV('m_tier', TIER_LABEL[m.tier])
  setV('vida', vidaBase(id))
  setV('m_hab', m.hab)
  setV('m_rec', m.rec .. (doble and ' (¡doble!)' or ''))
  setV('m_pen', m.pen)
  local vida = m.hp == 'special' and 'especial' or tostring(vidaBase(id))
  log('Monstruo ' .. V('monstruos_revelados') .. ' de 10: ' .. m.nombre .. ' (' .. TIER_LABEL[m.tier] .. '), vida ' .. vida .. '.')
end

-- Choosing a tile ------------------------------------------------------------

-- A secret choice waits in the engine and runs here at the reveal, one player after another in turn order;
-- on Día Transparente it runs at once, in the open.
function elegir(ctx)
  local s, seat, tile = st(), ctx.actor, ctx.params.casilla
  local nueva = not s.elec[seat]
  s.elec[seat] = tile
  save(s)
  setR(seat, 'pos', TILE_CODE[tile])
  if not ctx.quieta then moverFicha(seat, tile) end
  if nueva then setV('elegidos', V('elegidos') + 1) end
  if V('carta') == 'transparente' then
    log(nombre(seat) .. ' elige ' .. TILE_LABEL[tile] .. '.')
    local faltan = {}
    for _, j in ipairs(jugadores()) do if not s.elec[j] then faltan[#faltan + 1] = j end end
    setV('elec_txt', #faltan > 0 and ('Falta por elegir: ' .. nombres(faltan) .. '.') or 'Todos han elegido.')
  end
end

-- A character token dropped on a space (zone casilla_<tile>): the same choice as the button. Whoever moves it, it
-- counts for the token's owner, as at a real table. In a blind round this runs at the reveal.
function colocar(ctx)
  local ficha, tile = tostring(ctx.it or ''), ctx.args.casilla
  if not ficha:match('^ficha_') or Game.getPhase() ~= 'elegir' then return end
  local dueno
  for seat, pj in pairs(st().pj or {}) do if 'ficha_' .. pj == ficha then dueno = seat end end
  if not dueno then return end
  -- Day and night spaces share an arc: a token on the other half means today's space of that arc.
  if V('ok_' .. tile) ~= 1 then
    for _, arco in ipairs(ARCS) do
      if arco[1] == tile then tile = arco[2] elseif arco[2] == tile then tile = arco[1] end
    end
  end
  -- The token stays where it was dropped; «Siguiente turno» takes it home.
  elegir({ actor = dueno, params = { casilla = tile }, quieta = true })
end

-- After the reveal each player, in turn order, does what their space says by hand.
function revelar(ctx)
  local s = st()
  local resumen = {}
  for _, seat in ipairs(orden()) do
    resumen[#resumen + 1] = nombre(seat) .. ': ' .. (s.elec[seat] and TILE_LABEL[s.elec[seat]] or 'sin casilla')
  end
  log('Casillas: ' .. table.concat(resumen, ' · ') .. '. Jugad en orden de turno.')
  setV('elec_txt', '')
end

-- Shop and cards -------------------------------------------------------------

function comprar(ctx)
  local seat, carta = ctx.actor, V('carta')
  local e = EQ[eqNum(ctx.params.carta)]
  local precio = e.precio
  if carta == 'mercado_negro' then precio = math.floor(precio / 2) end
  if pjDe(seat) == 'remi' then precio = math.max(0, precio - 2) end
  if R(seat, 'oro') < precio then return 'No tienes oro suficiente: cuesta ' .. precio .. '.' end
  if contarEquipo(seat) >= R(seat, 'espacios') then return 'Inventario lleno: vende o descarta un equipamiento antes de comprar.' end
  addR(seat, 'oro', -precio)
  log(nombre(seat) .. ' compra ' .. e.nombre .. ' por ' .. precio .. ' de oro.')
end

-- Equipment the table can apply by itself; the rest is announced and the player writes it on their mat counter.
local FIJO = { [20] = 5, [22] = 2, [25] = 2, [30] = 1, [33] = 1, [42] = 4 }
local MAZMORRA = { [6] = 3, [7] = 1, [16] = 3, [18] = 1, [19] = 3, [27] = 3, [28] = 1, [29] = 1, [32] = 3, [36] = 3, [40] = 2, [41] = 1 }
local function bonoPorDados(n, d)
  local impares, pares, seis, iguales, todosIguales = 0, 0, false, false, #d > 0
  local visto = {}
  for _, v in ipairs(d) do
    if v % 2 == 1 then impares = impares + 1 else pares = pares + 1 end
    if v == 6 then seis = true end
    if visto[v] then iguales = true end
    visto[v] = true
    if v ~= d[1] then todosIguales = false end
  end
  if n == 8 then return impares * 2 end
  if n == 9 then return iguales and 6 or 0 end
  if n == 10 then return seis and 6 or 0 end
  if n == 37 then return (#d > 0 and impares == 0) and 3 or 0 end
  if n == 39 then return (#d > 1 and todosIguales) and 4 or 0 end
  return nil
end

-- The card leaves the hand for the arena, so it cannot be played twice in one combat;
-- it comes back when the combat ends.
function usar_equipo(ctx)
  local s, seat, id = st(), ctx.actor, ctx.params.carta
  local n = eqNum(id)
  local e = EQ[n]
  local donde = enCombate(seat)
  local mon = monstruoActivo()
  if not donde then return 'Los equipamientos se juegan durante un combate (mazmorra o duelo).' end
  if donde == 'mazmorra' and (mon == 8 or s.rey2) then return 'En este combate no se pueden usar equipamientos.' end
  if donde == 'mazmorra' and n == 31 then return 'La Plaga no puede usarse en mazmorras.' end
  if R(seat, 'mana') < e.mana then return 'No tienes maná suficiente: necesitas ' .. e.mana .. ' y tienes ' .. R(seat, 'mana') .. '.' end
  addR(seat, 'mana', -e.mana)
  local bono
  if n == 31 then bono = -2
  elseif donde == 'mazmorra' and MAZMORRA[n] then bono = MAZMORRA[n]
  elseif FIJO[n] then bono = FIJO[n]
  elseif n == 3 then
    local d = tirar(1)
    bonoRemi(seat, d)
    bono = d[1]
    log('Comodín: dado adicional ' .. d[1] .. '.')
  else bono = bonoPorDados(n, s.dados[seat] or {}) end
  local gasto = ' (' .. e.mana .. ' de maná, le quedan ' .. R(seat, 'mana') .. ')'
  if bono then
    addR(seat, 'total', bono)
    log(nombre(seat) .. ' juega ' .. e.nombre .. gasto .. ': ' .. (bono >= 0 and '+' or '') .. bono .. ' a su total.')
  else
    log(nombre(seat) .. ' juega ' .. e.nombre .. gasto .. ': ' .. e.texto .. ' Sumadlo en vuestro contador del tapete.')
  end
  recalcular()
end

-- Baltazar's passive, Resorte, Caja Sorpresa, Sello Maligno: a die is replaced, not added.
function repetir_dado(ctx)
  local s, seat, i = st(), ctx.actor, numero(ctx.params.dado)
  local d = s.dados[seat] or {}
  if not d[i] then return 'No tienes un dado ' .. i .. ' en este combate.' end
  local nuevo = tirar(1)
  bonoRemi(seat, nuevo)
  local antes = d[i]
  d[i] = nuevo[1]
  s.dados[seat] = d
  save(s)
  mostrarDados(seat, d)
  addR(seat, 'total', d[i] - antes)
  log(nombre(seat) .. ' repite su dado ' .. i .. ': ' .. antes .. ' → ' .. d[i] .. ' (total ' .. R(seat, 'total') .. ').')
  recalcular()
end

-- Dungeon --------------------------------------------------------------------

local function lanzarCombatiente(seat, mon)
  local d
  if mon == 17 then d = { 1, 1 }
  else
    d = dadosIniciales(seat, mon == 8 and 3 or 2)
    bonoRemi(seat, d)
    if mon == 2 then
      local hi = 1
      for i, v in ipairs(d) do if v > d[hi] then hi = i end end
      local nuevo = tirar(1)[1]
      log('Diablillo: ' .. nombre(seat) .. ' repite su ' .. d[hi] .. ' y saca ' .. nuevo .. '.')
      d[hi] = nuevo
    end
  end
  mostrarDados(seat, d)
  return d
end

function iniciar_mazmorra(ctx)
  local s, mon = st(), monstruoActivo()
  local m = MON[mon]
  local comb = {}
  for _, seat in ipairs(orden()) do if s.elec[seat] == 'mazmorra' then comb[#comb + 1] = seat end end
  if mon == 16 and #comb == 1 then return 'Polilla Gigante con un solo jugador: roba una carta de evento en vez de pelear.' end
  local n = V('jugadores')

  if mon == 18 then
    local pagan = {}
    for _, seat in ipairs(comb) do
      local d = tirar(1)[1]
      if d >= 4 then
        if R(seat, 'oro') >= 15 then
          addR(seat, 'oro', -15)
          log('Ofrenda al Balrog: ' .. nombre(seat) .. ' saca ' .. d .. ' y sacrifica 15 de oro.')
          pagan[#pagan + 1] = seat
        else log('Ofrenda al Balrog: ' .. nombre(seat) .. ' saca ' .. d .. ' y no tiene 15 de oro: no participa.') end
      elseif contarEquipo(seat) > 0 then
        log('Ofrenda al Balrog: ' .. nombre(seat) .. ' saca ' .. d .. ': descarta 1 equipamiento a elección (a mano).')
        pagan[#pagan + 1] = seat
      else log('Ofrenda al Balrog: ' .. nombre(seat) .. ' saca ' .. d .. ' y no tiene equipamiento: no participa.') end
    end
    comb = pagan
    if #comb == 0 then return 'Nadie pudo pagar la ofrenda al Balrog.' end
  end

  local vida = vidaBase(mon)
  if mon == 10 then vida = vida + 3 * (n - #comb) end
  if mon == 1 then
    local d = tirar(1)[1]
    vida = vida + d
    log('Grumo: ' .. nombre(comb[1]) .. ' lanza ' .. d .. ' y se suma a la vida del monstruo.')
  end
  if mon == 7 then
    local d = tirar(2 * #comb)
    vida = vida + suma(d)
    log('La Sombra Acechante lanza ' .. txtDados(d) .. ' y lo suma a su vida.')
  end
  s.mimico = (mon == 3 and #comb == n) or nil
  if s.mimico then log('¡Van todos los jugadores! El Mímico gana automáticamente.') end

  s.comb, s.dados = comb, {}
  for _, seat in ipairs(comb) do
    local d = lanzarCombatiente(seat, mon)
    s.dados[seat] = d
    setR(seat, 'total', suma(d))
    setR(seat, 'lucha', 1)
    log(nombre(seat) .. ': ' .. txtDados(d))
  end
  save(s)
  setV('vida', vida)
  setV('combate', 1)
  for _, seat in ipairs(comb) do
    local pj = pjDe(seat)
    if pj == 'skull' then log('Skull: toma 1 equipamiento al azar del descarte para este combate y devuélvelo al terminar.') end
    if pj == 'baltazar' then log('Baltazar: puede repetir uno de sus dados una vez («Repetir uno de mis dados»).') end
  end
  if mon == 16 then log('Polilla Gigante: cada combatiente decide en secreto si ayuda a la Polilla o al grupo; comparad los bandos y resolved con Victoria o Derrota. Empate: gana el monstruo.') end
  if mon == 20 then log('Rey de los Cielos: apostad oro en orden de turno devolviendo monedas al banco (se pierden siempre). Los premios se reparten de mayor a menor apuesta.') end
  if mon == 17 then log('Gigante de Hielo: todos empiezan con 1 y 1, y solo los equipamientos los cambian.') end
  log('¡Combate en la arena contra ' .. m.nombre .. '! Jugad equipamientos en orden de turno (cuestan maná) y después «Resolver el combate».')
  recalcular()
end

function resolver_mazmorra(ctx)
  local s, mon, carta = st(), monstruoActivo(), V('carta')
  local m, comb, vida = MON[mon], s.comb or {}, V('vida')
  local res = ctx.params.resultado
  for _, seat in ipairs(SEATS) do setR(seat, 'premio_eq', 0) end
  if mon == 16 and res == 'auto' then return 'La Polilla Gigante se resuelve a mano: elegid Victoria o Derrota.' end

  local total = 0
  for _, seat in ipairs(comb) do total = total + R(seat, 'total') end
  local mult = (carta == 'caza' and 2 or 1) * (carta == 'legendario' and 2 or 1)

  local function premiar(seat)
    if m.oro > 0 then addR(seat, 'oro', m.oro * mult) end
    if m.eq > 0 then setR(seat, 'premio_eq', math.min(6, m.eq * mult)) end
    if m.mana > 0 then addR(seat, 'mana_max', m.mana) end
  end
  local function castigar(seat)
    if mon == 9 then
      local d = tirar(1)[1]
      addR(seat, 'oro', -d)
      log('Hongo Alien: ' .. nombre(seat) .. ' pierde ' .. d .. ' de oro.')
    else addR(seat, 'oro', -m.castigo) end
  end
  local function peor(lista)
    local p
    for _, seat in ipairs(lista) do if not p or R(seat, 'total') < R(p, 'total') then p = seat end end
    return p
  end

  if mon == 19 and res == 'auto' then
    local perdedores = {}
    for _, seat in ipairs(comb) do
      if R(seat, 'total') > vida then
        premiar(seat)
        log(nombre(seat) .. ' vence al Dragón Terrestre: +1 de maná máximo y ' .. 10 * mult .. ' de oro.')
      else
        castigar(seat)
        perdedores[#perdedores + 1] = seat
        log(nombre(seat) .. ' cae ante el Dragón Terrestre: -10 de oro.')
      end
    end
    local p = peor(perdedores)
    if p then addR(p, 'mana_max', -1) recuperarMana(p, 0) log(nombre(p) .. ' fue el peor lanzador: pierde 1 de maná máximo para siempre.') end
    setV('combate_txt', 'Combate contra el Dragón Terrestre resuelto')
  else
    local gana
    if res == 'victoria' then gana = true
    elseif res == 'derrota' then gana = false
    elseif s.mimico then gana = false
    else gana = total > vida end

    if gana and mon == 15 and not s.rey2 then
      s.rey2 = true
      setV('vida', 5 * #comb)
      log('¡El Rey Nigromante se levanta de nuevo! Vida ' .. 5 * #comb .. ', sin equipamientos. Nueva tirada:')
      for _, seat in ipairs(comb) do
        local d = tirar(2)
        bonoRemi(seat, d)
        mostrarDados(seat, d)
        s.dados[seat] = d
        setR(seat, 'total', suma(d))
        log(nombre(seat) .. ': ' .. txtDados(d))
      end
      save(s)
      recalcular()
      return
    end

    if gana then
      log('¡Victoria contra ' .. m.nombre .. '! (' .. total .. ' contra ' .. vida .. ')')
      local excluidos = {}
      if mon == 6 then
        local bajo, quien = 99, nil
        for _, seat in ipairs(comb) do
          for _, v in ipairs(s.dados[seat] or {}) do if v < bajo then bajo, quien = v, seat end end
        end
        if quien then excluidos[quien] = true log('Troll: ' .. nombre(quien) .. ' tuvo el dado más bajo y no recibe recompensa.') end
      end
      if mon == 12 then
        for _, seat in ipairs(comb) do
          if R(seat, 'total') <= 8 then excluidos[seat] = true log('Cocatriz: ' .. nombre(seat) .. ' sacó 8 o menos y no recibe recompensa.') end
        end
      end
      for _, seat in ipairs(comb) do if not excluidos[seat] then premiar(seat) end end
      if mon == 20 then log('Rey de los Cielos: repartid 1) +1 de maná, 2) 3 equipamientos, 3) 30 de oro, de mayor a menor apuesta.') end
      if mon == 4 then
        for _, seat in ipairs(jugadores()) do
          if not contiene(comb, seat) then addR(seat, 'oro', -2) log('Sirena: ' .. nombre(seat) .. ' no participó y pierde 2 de oro.') end
        end
      end
      if mon == 9 then
        for _, seat in ipairs(comb) do
          local d = tirar(1)[1]
          addR(seat, 'oro', d)
          log('Hongo Alien: ' .. nombre(seat) .. ' gana ' .. d .. ' de oro.')
        end
      end
      if mon == 14 then
        local rico
        for _, seat in ipairs(jugadores()) do if not rico or R(seat, 'oro') > R(rico, 'oro') then rico = seat end end
        addR(rico, 'oro', -10)
        log('Dullahan: ' .. nombre(rico) .. ' es quien más oro tiene y pierde 10.')
      end
      setV('combate_txt', 'Victoria contra ' .. m.nombre)
    else
      log('Derrota contra ' .. m.nombre .. ' (' .. total .. ' contra ' .. vida .. '). Penitencia: ' .. m.pen)
      for _, seat in ipairs(comb) do castigar(seat) end
      local p = peor(comb)
      if (mon == 17 or mon == 18) and p then log(nombre(p) .. ' fue el peor lanzador y descarta 1 equipamiento (a mano).') end
      if mon == 7 or mon == 15 then log('Cada combatiente descarta 1 equipamiento (a mano).') end
      if mon == 20 then log('Rey de los Cielos: quienes no participaron y la menor apuesta pierden 2 equipamientos a elección.') end
      if mon == 5 then setV('esqueleto', 1) log('El Esqueleto Guerrero volverá el próximo día con la misma vida.') end
      setV('combate_txt', 'Derrota contra ' .. m.nombre)
    end
  end

  if mon == 11 then
    local p = peor(comb)
    if p then setV('forzado', p) log('Basilisco de Fuego: ' .. nombre(p) .. ' tuvo el total más bajo y deberá descansar la próxima noche.') end
  end
  if mon == 13 and #comb > 1 then
    local mejor
    for _, seat in ipairs(comb) do if not mejor or R(seat, 'total') > R(mejor, 'total') then mejor = seat end end
    for _, seat in ipairs(comb) do
      if seat ~= mejor then
        local paga = math.min(2, R(seat, 'oro'))
        addR(seat, 'oro', -paga)
        addR(mejor, 'oro', paga)
      end
    end
    log('Musgo Viviente: ' .. nombre(mejor) .. ' recibe 2 monedas de cada combatiente.')
  end
  for _, seat in ipairs(comb) do if pjDe(seat) == 'skull' then log('Skull: devuelve el equipamiento prestado al descarte.') end end
  log('Los equipamientos jugados vuelven a la mano de sus dueños.')
  s.comb, s.rey2, s.mimico = nil, nil, nil
  save(s)
  for _, seat in ipairs(SEATS) do setR(seat, 'lucha', 0) end
  setV('combate', 0)
  setV('monstruo', m.nombre .. ' (resuelto)')
  recogerDados()
  setV('batalla_txt', '')
end

-- Duels ----------------------------------------------------------------------

function duelo(ctx)
  local s, a, b, motivo, carta = st(), ctx.actor, ctx.params.rival, ctx.params.motivo, V('carta')
  if V('combate') == 1 then return 'Termina primero el combate de la mazmorra.' end
  if V('torneo') == 1 then
    if R(a, 'vivo') == 0 or R(b, 'vivo') == 0 then return 'Ese jugador ya fue eliminado del torneo.' end
  else
    if carta == 'tregua' or carta == 'noche_tranquila' then return 'Hoy nadie puede iniciar duelos.' end
    if motivo == 'ring' and s.elec[a] ~= 'ring' then return 'Solo quienes están en el Ring pelean en el Ring.' end
    if motivo == 'torre' and s.elec[a] ~= 'torre' and s.elec[b] ~= 'torre' then return 'El duelo por la Torre es entre quienes llegan a la Torre (o su dueño).' end
  end
  s.duelo = { a = a, b = b, motivo = motivo }
  s.dados = {}
  for _, seat in ipairs({ a, b }) do
    local d = dadosIniciales(seat, 2)
    bonoRemi(seat, d)
    mostrarDados(seat, d)
    s.dados[seat] = d
    setR(seat, 'total', suma(d))
    setR(seat, 'lucha', 1)
    log(nombre(seat) .. ': ' .. txtDados(d))
  end
  save(s)
  log('¡Duelo en la arena (' .. MOTIVO[motivo] .. ')! Quien va perdiendo puede jugar equipamientos para superar al rival; alternad hasta que nadie responda y pulsad «Resolver el duelo».')
  recalcular()
end

local function campeon()
  local vivos = {}
  for _, seat in ipairs(jugadores()) do if R(seat, 'vivo') == 1 then vivos[#vivos + 1] = seat end end
  if #vivos == 1 then
    log('¡' .. nombre(vivos[1]) .. ' es el Campeón de Tornaris!')
    setV('torneo_txt', 'Campeón: ' .. nombre(vivos[1]))
    setV('carta_efecto', '¡' .. nombre(vivos[1]) .. ' es el Campeón de Tornaris!')
    Game.win(vivos[1])
  end
end

function resolver_duelo(ctx)
  local s = st()
  local du = s.duelo
  local a, b = du.a, du.b
  local ta, tb = R(a, 'total'), R(b, 'total')
  if ta == tb and du.motivo == 'torneo' then
    -- Tournament: whoever is earlier in the tournament order has the advantage and wins ties.
    for _, seat in ipairs(s.torneo or {}) do
      if seat == a then tb = tb - 1 log('Empate: ' .. nombre(a) .. ' tiene ventaja en el torneo.') break end
      if seat == b then ta = ta - 1 log('Empate: ' .. nombre(b) .. ' tiene ventaja en el torneo.') break end
    end
  end
  while ta == tb do
    local da, db = tirar(2), tirar(2)
    ta, tb = suma(da), suma(db)
    log('Empate: se lanza de nuevo sin equipamientos. ' .. nombre(a) .. ' ' .. txtDados(da) .. ' · ' .. nombre(b) .. ' ' .. txtDados(db))
  end
  local gana, pierde = a, b
  if tb > ta then gana, pierde = b, a end
  log(nombre(gana) .. ' gana el duelo (' .. math.max(ta, tb) .. ' contra ' .. math.min(ta, tb) .. ').')
  if du.motivo == 'ring' then
    addR(gana, 'oro', 12)
    log(nombre(gana) .. ' gana 12 de oro en el Ring.')
  elseif du.motivo == 'torre' then
    if V('torre_dueno') ~= gana then conquistar(gana) else log(nombre(gana) .. ' defiende la Torre.') end
  end
  if pjDe(gana) == 'nyra' then
    local robo = math.min(7, R(pierde, 'oro'))
    addR(pierde, 'oro', -robo)
    addR(gana, 'oro', robo)
    log('Nyra le roba ' .. robo .. ' de oro a ' .. nombre(pierde) .. '.')
  end
  for _, seat in ipairs({ a, b }) do
    for _, id in ipairs(idsEnZona(ARENA_ZONE[seat], '^eq_31_')) do
      log('La Plaga que jugó ' .. nombre(seat) .. ' pasa a la mano de su rival: dásela con la mano.')
    end
  end
  s.duelo = nil
  save(s)
  setR(a, 'lucha', 0)
  setR(b, 'lucha', 0)
  setV('duelo_txt', '-')
  recogerDados()
  setV('batalla_txt', '')
  if du.motivo == 'torneo' then
    setR(pierde, 'vivo', 0)
    log(nombre(pierde) .. ' queda fuera del torneo.')
    campeon()
  end
end

-- End of turn and tournament ---------------------------------------------------

function fin_turno(ctx)
  for _, seat in ipairs(jugadores()) do moverFicha(seat) end
  if V('fase') == 'noche' and V('forzado') ~= '' then setV('forzado', '') end
  local js, cur = jugadores(), Game.getCurrentSeat()
  local sig = js[1]
  for i, seat in ipairs(js) do if seat == cur then sig = js[i % #js + 1] end end
  log('Fin del turno. El token pasa a ' .. nombre(sig) .. '.')
end

local BRACKETS = {
  [3] = 'Semifinal: 2.º contra 3.º · Final: el ganador contra el 1.º',
  [4] = 'Semifinal 1: 1.º contra 2.º · Semifinal 2: 3.º contra 4.º · Final: los dos ganadores',
  [5] = 'Cuartos: 2.º contra 3.º y 4.º contra 5.º · Semifinal: los dos ganadores · Final: el ganador contra el 1.º',
  [6] = 'Cuartos: 1.º contra 2.º, 3.º contra 4.º y 5.º contra 6.º · Semifinal: los ganadores de 3.º/4.º y 5.º/6.º · Final: el ganador de la semifinal contra el ganador de 1.º/2.º',
}

function inicio_torneo(ctx)
  local js = jugadores()
  setV('torneo', 1)
  setV('fase_txt', 'Torneo Final')
  setV('carta_txt', 'Coliseo')
  setV('carta_efecto', 'Convierte tu oro (5: equipamiento, 15: espacio, 30: maná) y pelead los duelos del cuadro en la arena.')
  setV('monstruo', 'Ninguno: se acabaron los monstruos')
  setV('m_tier', '-')
  setV('vida', 0)
  setV('m_hab', '-')
  setV('m_rec', '-')
  setV('m_pen', '-')
  setV('combate_txt', '-')
  setV('combate', 0)
  setV('batalla_txt', '')
  iluminar('torneo')
  for _, seat in ipairs(js) do moverFicha(seat) setR(seat, 'total', 0) end
  log('¡Se acabaron los monstruos! Comienza el Torneo Final en el Coliseo.')
  -- Everyone rolls a die; the highest gets first place and the order continues to the right.
  local primero
  local candidatos = js
  while not primero do
    local alto, empatados = 0, {}
    local tiradas = {}
    for _, seat in ipairs(candidatos) do
      local d = tirar(1)[1]
      tiradas[#tiradas + 1] = nombre(seat) .. ' ' .. d
      if d > alto then alto, empatados = d, { seat } elseif d == alto then empatados[#empatados + 1] = seat end
    end
    log('Tirada para el primer puesto: ' .. table.concat(tiradas, ', '))
    if #empatados == 1 then primero = empatados[1] else candidatos = empatados end
  end
  local i0 = 1
  for i, seat in ipairs(js) do if seat == primero then i0 = i end end
  local orden, partes = {}, {}
  for k = 0, #js - 1 do
    local seat = js[((i0 - 1 + k) % #js) + 1]
    orden[#orden + 1] = seat
    partes[#partes + 1] = (k + 1) .. '.º ' .. nombre(seat)
  end
  local s = st()
  s.torneo = orden
  save(s)
  setV('orden_txt', table.concat(partes, ', '))
  setV('torneo_txt', BRACKETS[#js])
  setV('carta_efecto', BRACKETS[#js])
  log('Orden del torneo: ' .. table.concat(partes, ', ') .. '. ' .. BRACKETS[#js])
  log('En cada duelo, quien va antes en el orden del torneo tiene ventaja: gana los empates y su rival juega primero.')
end

function convertir_oro(ctx)
  local seat, op = ctx.actor, ctx.params.opcion
  local coste = ({ equipo_5 = 5, espacio_15 = 15, mana_30 = 30 })[op]
  if R(seat, 'oro') < coste then return 'Necesitas ' .. coste .. ' de oro.' end
  if op == 'equipo_5' and contarEquipo(seat) >= R(seat, 'espacios') then return 'Inventario lleno.' end
  addR(seat, 'oro', -coste)
  if op == 'espacio_15' then addR(seat, 'espacios', 1) log(nombre(seat) .. ' convierte 15 de oro en 1 espacio de equipamiento.') end
  if op == 'mana_30' then addR(seat, 'mana_max', 1) log(nombre(seat) .. ' convierte 30 de oro en 1 de maná.') end
  if op == 'equipo_5' then log(nombre(seat) .. ' convierte 5 de oro en 1 equipamiento aleatorio.') end
end
