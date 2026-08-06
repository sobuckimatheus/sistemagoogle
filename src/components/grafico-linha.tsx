/**
 * Gráfico de linha em SVG puro.
 *
 * Sem biblioteca de gráficos de propósito: uma série temporal simples não
 * justifica somar ~50 kB ao bundle, e SVG renderizado no servidor não custa
 * JavaScript no cliente.
 */

export type PontoSerie = { data: Date; valor: number };

export function GraficoLinha({
  serie,
  altura = 160,
  rotulo,
}: {
  serie: PontoSerie[];
  altura?: number;
  rotulo: string;
}) {
  if (serie.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-neutral-300 text-sm text-neutral-500 dark:border-neutral-700"
        style={{ height: altura }}
      >
        Pelo menos dois dias de dados são necessários para desenhar a evolução.
      </div>
    );
  }

  const largura = 720;
  const margem = { topo: 8, direita: 8, baixo: 20, esquerda: 36 };
  const areaW = largura - margem.esquerda - margem.direita;
  const areaH = altura - margem.topo - margem.baixo;

  const maximo = Math.max(...serie.map((p) => p.valor), 1);

  const x = (i: number) => margem.esquerda + (i / (serie.length - 1)) * areaW;
  const y = (v: number) => margem.topo + areaH - (v / maximo) * areaH;

  const linha = serie.map((p, i) => `${x(i)},${y(p.valor)}`).join(" ");
  const area = `${margem.esquerda},${margem.topo + areaH} ${linha} ${
    margem.esquerda + areaW
  },${margem.topo + areaH}`;

  const primeiro = serie[0].data;
  const ultimo = serie[serie.length - 1].data;
  const formato = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      className="w-full"
      role="img"
      aria-label={`Evolução de ${rotulo}`}
    >
      {/* Linhas de referência em 0, metade e máximo */}
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={margem.esquerda}
            x2={margem.esquerda + areaW}
            y1={y(maximo * f)}
            y2={y(maximo * f)}
            className="stroke-neutral-200 dark:stroke-neutral-800"
            strokeWidth="1"
          />
          <text
            x={margem.esquerda - 6}
            y={y(maximo * f) + 4}
            textAnchor="end"
            className="fill-neutral-400 text-[10px]"
          >
            {Math.round(maximo * f)}
          </text>
        </g>
      ))}

      <polygon points={area} className="fill-neutral-900/5 dark:fill-white/5" />
      <polyline
        points={linha}
        fill="none"
        className="stroke-neutral-900 dark:stroke-white"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      <text
        x={margem.esquerda}
        y={altura - 4}
        className="fill-neutral-400 text-[10px]"
      >
        {formato.format(primeiro)}
      </text>
      <text
        x={margem.esquerda + areaW}
        y={altura - 4}
        textAnchor="end"
        className="fill-neutral-400 text-[10px]"
      >
        {formato.format(ultimo)}
      </text>
    </svg>
  );
}
