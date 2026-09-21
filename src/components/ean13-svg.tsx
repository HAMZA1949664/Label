"use client";

/**
 * Rendu EAN-13 natif en SVG (aucune bibliothèque externe) — portage fidèle
 * du moteur de l'application d'origine : barres réelles, scanables, avec
 * gardes descendant(e)s et lecture humaine du code.
 */

const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13Valide(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const d = code.split("").map(Number);
  const sum = d.slice(0, 12).reduce((acc, digit, i) => acc + digit * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === d[12];
}

interface Ean13SvgProps {
  code: string;
  /** Largeur d'un module (px SVG). Défaut : 2.1. */
  moduleW?: number;
  className?: string;
}

export function Ean13Svg({ code, moduleW = 2.1, className }: Ean13SvgProps) {
  if (!ean13Valide(code)) {
    return (
      <div className="flex h-24 items-center justify-center rounded border border-dashed text-xs text-red-600">
        Code-barres invalide : {code || "—"}
      </div>
    );
  }

  const digits = code.split("").map(Number);
  const first = digits[0];
  const left = digits.slice(1, 7);
  const right = digits.slice(7, 13);
  const parity = EAN_PARITY[first];

  let bits = "101"; // garde de début
  left.forEach((d, i) => {
    bits += parity[i] === "L" ? EAN_L[d] : EAN_G[d];
  });
  bits += "01010"; // garde centrale
  right.forEach((d) => {
    bits += EAN_R[d];
  });
  bits += "101"; // garde de fin

  const barHeight = 58;
  const guardExtra = 6;
  const quiet = 10;
  const width = quiet * 2 + bits.length * moduleW;
  const height = barHeight + guardExtra + 16;

  const guardIndexes = new Set<number>();
  for (let i = 0; i < 3; i++) guardIndexes.add(i);
  for (let i = 45; i < 50; i++) guardIndexes.add(i);
  for (let i = bits.length - 3; i < bits.length; i++) guardIndexes.add(i);

  const rects: React.ReactElement[] = [];
  let x = quiet;
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === "1") {
      const h = guardIndexes.has(i) ? barHeight + guardExtra : barHeight;
      rects.push(<rect key={i} x={x} y={0} width={moduleW} height={h} fill="#111111" />);
    }
    x += moduleW;
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label={`Code-barres EAN-13 ${code}`}
      style={{ background: "#ffffff", maxWidth: "100%" }}
    >
      {rects}
      <text
        x={width / 2}
        y={barHeight + guardExtra + 13}
        textAnchor="middle"
        fontFamily="monospace"
        fontSize="13"
        letterSpacing="2"
        fill="#111111"
      >
        {code}
      </text>
    </svg>
  );
}
