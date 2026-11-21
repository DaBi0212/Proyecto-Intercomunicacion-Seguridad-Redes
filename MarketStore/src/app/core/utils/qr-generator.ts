/**
 * Generador ISO/IEC 18004 de Códigos QR (Modo Byte, Nivel de Corrección L, Versiones 1 a 10).
 * 100% autónomo (sin dependencias externas), funciona en Vercel y local,
 * produciendo matrices QR reales escaneables por la cámara móvil de WalletPay.
 */

const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = EXP_TABLE[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const rem = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

interface VersionSpec {
  version: number;
  totalDataBytes: number;
  ecBytesPerBlock: number;
  numBlocks1: number;
  dataBytesBlock1: number;
  numBlocks2: number;
  dataBytesBlock2: number;
  alignment: number[];
}

const VERSION_SPECS_L: VersionSpec[] = [
  { version: 1, totalDataBytes: 19, ecBytesPerBlock: 7, numBlocks1: 1, dataBytesBlock1: 19, numBlocks2: 0, dataBytesBlock2: 0, alignment: [] },
  { version: 2, totalDataBytes: 34, ecBytesPerBlock: 10, numBlocks1: 1, dataBytesBlock1: 34, numBlocks2: 0, dataBytesBlock2: 0, alignment: [6, 18] },
  { version: 3, totalDataBytes: 55, ecBytesPerBlock: 15, numBlocks1: 1, dataBytesBlock1: 55, numBlocks2: 0, dataBytesBlock2: 0, alignment: [6, 22] },
  { version: 4, totalDataBytes: 80, ecBytesPerBlock: 20, numBlocks1: 1, dataBytesBlock1: 80, numBlocks2: 0, dataBytesBlock2: 0, alignment: [6, 26] },
  { version: 5, totalDataBytes: 108, ecBytesPerBlock: 26, numBlocks1: 1, dataBytesBlock1: 108, numBlocks2: 0, dataBytesBlock2: 0, alignment: [6, 30] },
  { version: 6, totalDataBytes: 136, ecBytesPerBlock: 18, numBlocks1: 2, dataBytesBlock1: 68, numBlocks2: 0, dataBytesBlock2: 0, alignment: [6, 34] },
  { version: 7, totalDataBytes: 156, ecBytesPerBlock: 20, numBlocks1: 2, dataBytesBlock1: 78, numBlocks2: 0, dataBytesBlock2: 0, alignment: [6, 22, 38] },
  { version: 8, totalDataBytes: 194, ecBytesPerBlock: 24, numBlocks1: 2, dataBytesBlock1: 97, numBlocks2: 0, dataBytesBlock2: 0, alignment: [6, 24, 42] },
  { version: 9, totalDataBytes: 232, ecBytesPerBlock: 30, numBlocks1: 2, dataBytesBlock1: 116, numBlocks2: 0, dataBytesBlock2: 0, alignment: [6, 26, 46] },
  { version: 10, totalDataBytes: 274, ecBytesPerBlock: 18, numBlocks1: 2, dataBytesBlock1: 68, numBlocks2: 2, dataBytesBlock2: 69, alignment: [6, 28, 50] }
];

export function encodeQrMatrix(text: string): boolean[][] {
  const utf8 = new TextEncoder().encode(text || 'WPTKT');
  let spec = VERSION_SPECS_L[VERSION_SPECS_L.length - 1];
  for (const candidate of VERSION_SPECS_L) {
    const headerBytes = candidate.version >= 10 ? 3 : 2;
    if (utf8.length + headerBytes <= candidate.totalDataBytes) {
      spec = candidate;
      break;
    }
  }

  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };

  pushBits(0b0100, 4);
  pushBits(utf8.length, spec.version >= 10 ? 16 : 8);
  for (let i = 0; i < utf8.length; i++) {
    pushBits(utf8[i], 8);
  }

  const maxDataBits = spec.totalDataBytes * 8;
  const terminator = Math.min(4, maxDataBits - bits.length);
  pushBits(0, terminator);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes = new Uint8Array(spec.totalDataBytes);
  for (let i = 0; i < bits.length / 8; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
    dataBytes[i] = b;
  }
  const padBytes = [0xec, 0x11];
  for (let i = bits.length / 8, p = 0; i < spec.totalDataBytes; i++, p++) {
    dataBytes[i] = padBytes[p & 1];
  }

  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < spec.numBlocks1; i++) {
    const block = dataBytes.slice(offset, offset + spec.dataBytesBlock1);
    offset += spec.dataBytesBlock1;
    dataBlocks.push(block);
    ecBlocks.push(rsRemainder(block, spec.ecBytesPerBlock));
  }
  for (let i = 0; i < spec.numBlocks2; i++) {
    const block = dataBytes.slice(offset, offset + spec.dataBytesBlock2);
    offset += spec.dataBytesBlock2;
    dataBlocks.push(block);
    ecBlocks.push(rsRemainder(block, spec.ecBytesPerBlock));
  }

  const finalBytes: number[] = [];
  const maxBlockLen = Math.max(spec.dataBytesBlock1, spec.dataBytesBlock2);
  for (let i = 0; i < maxBlockLen; i++) {
    for (const b of dataBlocks) {
      if (i < b.length) finalBytes.push(b[i]);
    }
  }
  for (let i = 0; i < spec.ecBytesPerBlock; i++) {
    for (const eb of ecBlocks) {
      finalBytes.push(eb[i]);
    }
  }

  const size = spec.version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunc: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setFunctionModule = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r][c] = dark;
      isFunc[r][c] = true;
    }
  };

  const drawFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const inBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inCenter = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunctionModule(top + dr, left + dc, inOuter && (inBorder || inCenter));
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }

  const align = spec.alignment;
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) {
        continue;
      }
      const cr = align[i];
      const cc = align[j];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFunctionModule(cr + dr, cc + dc, dark);
        }
      }
    }
  }

  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      setFunctionModule(8, i, false);
      setFunctionModule(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    setFunctionModule(8, size - 1 - i, false);
    setFunctionModule(size - 1 - i, 8, false);
  }
  setFunctionModule(size - 8, 8, true);

  const allBits: number[] = [];
  for (const byte of finalBytes) {
    for (let i = 7; i >= 0; i--) allBits.push((byte >>> i) & 1);
  }

  let bitIdx = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (!isFunc[r][c]) {
          const dark = bitIdx < allBits.length ? allBits[bitIdx] === 1 : false;
          bitIdx++;
          modules[r][c] = dark !== ((r + c) % 2 === 0);
        }
      }
    }
    upward = !upward;
  }

  const formatBits = 0x77c4;
  const fBit = (i: number) => ((formatBits >>> i) & 1) === 1;

  for (let i = 0; i <= 5; i++) setFunctionModule(8, i, fBit(i));
  setFunctionModule(8, 7, fBit(6));
  setFunctionModule(8, 8, fBit(7));
  setFunctionModule(7, 8, fBit(8));
  for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, fBit(i));

  for (let i = 0; i < 8; i++) setFunctionModule(8, size - 1 - i, fBit(i));
  for (let i = 8; i < 15; i++) setFunctionModule(size - 15 + i, 8, fBit(i));
  setFunctionModule(size - 8, 8, true);

  return modules;
}

export function generateQrSvgData(text: string): { viewBox: string; path: string; size: number } {
  const matrix = encodeQrMatrix(text);
  const n = matrix.length;
  const margin = 2;
  const total = n + margin * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        d += `M${c + margin},${r + margin}h1v1h-1z`;
      }
    }
  }
  return {
    viewBox: `0 0 ${total} ${total}`,
    path: d,
    size: total
  };
}
