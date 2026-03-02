// Web Worker that loads cubiomes WASM and processes requests
// Note: Emscripten 5.x uses WASM_BIGINT by default, so int64_t params need BigInt
let Module = null;

function toBigInt(val) {
  if (typeof val === 'bigint') return val;
  return BigInt(Math.trunc(val));
}

async function initWasm() {
  importScripts('./api.js');
  Module = await createModule();
  // Init biome color palette
  Module._init_colors();
}

function handleGenerateBiomeImage(data) {
  const { seed, mcVersion, dim, x, z, width, height, scale, requestId } = data;

  // generate_biome_image(int64_t seed, int mc, int dim, int x, int z, int w, int h, int scale)
  // First param is i64 → needs BigInt
  const ptr = Module._generate_biome_image(toBigInt(seed), mcVersion, dim, x, z, width, height, scale);

  if (!ptr) {
    return { type: 'biomeImage', requestId, error: 'Generation failed (null ptr)' };
  }

  const size = width * height * 4;
  const pixels = new Uint8ClampedArray(Module.HEAPU8.buffer, ptr, size).slice();
  Module._free_memory(ptr);

  return { type: 'biomeImage', requestId, pixels, width, height };
}

function handleFindStructures(data) {
  const { seed, mcVersion, structType, regXMin, regZMin, regXMax, regZMax, fast, requestId } = data;

  let count;
  if (fast) {
    // find_structures_fast(int64_t seed, int mc, int stype, int rxmin, int rzmin, int rxmax, int rzmax)
    count = Module._find_structures_fast(toBigInt(seed), mcVersion, structType, regXMin, regZMin, regXMax, regZMax);
  } else {
    count = Module._find_structures(toBigInt(seed), mcVersion, structType, regXMin, regZMin, regXMax, regZMax);
  }

  const positions = [];
  for (let i = 0; i < count; i++) {
    positions.push({
      x: Module._get_structure_x(i),
      z: Module._get_structure_z(i),
    });
  }

  return { type: 'structures', requestId, positions };
}

function handleFindSpawn(data) {
  const { seed, mcVersion, requestId } = data;
  const x = Module._get_spawn_x(toBigInt(seed), mcVersion);
  const z = Module._get_spawn_z(toBigInt(seed), mcVersion);
  return { type: 'spawn', requestId, x, z };
}

function handleFindStrongholds(data) {
  const { seed, mcVersion, count, requestId } = data;
  const found = Module._find_strongholds(toBigInt(seed), mcVersion, count || 3);
  const positions = [];
  for (let i = 0; i < found; i++) {
    positions.push({
      x: Module._get_stronghold_x(i),
      z: Module._get_stronghold_z(i),
    });
  }
  return { type: 'strongholds', requestId, positions };
}

function handleCheckSlime(data) {
  const { seed, chunkX, chunkZ, requestId } = data;
  const isSlime = Module._check_slime_chunk(toBigInt(seed), chunkX, chunkZ);
  return { type: 'slimeChunk', requestId, isSlime: !!isSlime };
}

function handleCheckSlimeBatch(data) {
  const { seed, chunkXMin, chunkZMin, width, height, requestId } = data;
  const ptr = Module._check_slime_batch(toBigInt(seed), chunkXMin, chunkZMin, width, height);
  if (!ptr) {
    return { type: 'slimeBatch', requestId, error: 'Batch check failed' };
  }
  const total = width * height;
  const result = new Uint8Array(Module.HEAPU8.buffer, ptr, total).slice();
  return { type: 'slimeBatch', requestId, result, width, height };
}

function handleStringToSeed(data) {
  const { str, requestId } = data;
  // string_to_seed takes a string pointer - use ccall for string handling
  const seed = Module.ccall('string_to_seed', 'number', ['string'], [str]);
  return { type: 'seedValue', requestId, seed };
}

function handleGetBiomeColors() {
  const ptr = Module._get_biome_colors();
  const colors = new Uint8Array(Module.HEAPU8.buffer, ptr, 256 * 3).slice();
  const colorMap = {};
  for (let i = 0; i < 256; i++) {
    colorMap[i] = [colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]];
  }
  return { type: 'biomeColors', colors: colorMap };
}

let initPromise = null;

self.onmessage = async function(e) {
  const data = e.data;

  if (data.type === 'init') {
    if (!initPromise) {
      initPromise = initWasm();
    }
    try {
      await initPromise;
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err) });
    }
    return;
  }

  // Ensure initialized
  if (!Module) {
    if (!initPromise) initPromise = initWasm();
    await initPromise;
  }

  let result;
  try {
    switch (data.type) {
      case 'generateBiomeImage':
        result = handleGenerateBiomeImage(data);
        break;
      case 'findStructures':
        result = handleFindStructures(data);
        break;
      case 'findSpawn':
        result = handleFindSpawn(data);
        break;
      case 'findStrongholds':
        result = handleFindStrongholds(data);
        break;
      case 'checkSlime':
        result = handleCheckSlime(data);
        break;
      case 'checkSlimeBatch':
        result = handleCheckSlimeBatch(data);
        break;
      case 'stringToSeed':
        result = handleStringToSeed(data);
        break;
      case 'getBiomeColors':
        result = handleGetBiomeColors();
        break;
      default:
        result = { type: 'error', error: 'Unknown message type: ' + data.type };
    }
  } catch (err) {
    result = { type: 'error', requestId: data.requestId, error: String(err) };
  }

  self.postMessage(result);
};
