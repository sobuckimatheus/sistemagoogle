import { Icone, type NomeDeIcone } from "@/components/lumora/icones";

export const dinheiro = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export const dinheiroExato = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const numero = new Intl.NumberFormat("pt-BR");

export function percentual(v: number, casas = 1) {
  return `${(v * 100).toFixed(casas).replace(".", ",")}%`;
}

/** Superfície padrão do painel. Todo bloco de conteúdo é um destes. */
export function Cartao({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-cartao border border-borda bg-superficie ${className}`}
    >
      {children}
    </section>
  );
}

/** Sobrancelha de seção: versalete curto, sempre acompanhado do conteúdo. */
export function Rotulo({
  children,
  dica,
}: {
  children: React.ReactNode;
  dica?: string;
}) {
  return (
    <h2 className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.12em] text-texto-fraco">
      {children}
      {dica && (
        <span title={dica} className="text-texto-fraco/70">
          <Icone nome="info" className="size-3.5" />
        </span>
      )}
    </h2>
  );
}

/**
 * Variação contra o período anterior.
 *
 * O caso sem histórico é tratado à parte de propósito: o pior erro possível
 * neste painel é mostrar uma variação inventada com cara de medição.
 */
export function Variacao({
  valor,
  temHistorico,
  sufixo = "vs. período anterior",
  bomQuandoSobe = true,
}: {
  valor: number | null | undefined;
  temHistorico: boolean;
  sufixo?: string;
  bomQuandoSobe?: boolean;
}) {
  if (!temHistorico || valor === null || valor === undefined) {
    return (
      <p className="text-xs text-texto-fraco">sem base de comparação ainda</p>
    );
  }

  const subiu = valor >= 0;
  const bom = subiu === bomQuandoSobe;

  // Duas linhas por desenho: em coluna estreita a frase quebrava no meio e
  // deixava a faixa de métricas com alturas diferentes.
  return (
    <p className="text-xs leading-tight">
      <span
        className={`numero font-medium ${bom ? "text-alta" : "text-baixa"}`}
      >
        {subiu ? "▲" : "▼"} {percentual(Math.abs(valor))}
      </span>
      <span className="block text-[11px] text-texto-fraco">{sufixo}</span>
    </p>
  );
}

/**
 * Faixa de posição — onde o negócio está entre a média e o topo do segmento.
 *
 * É o gesto central do painel: quase toda métrica aqui só significa alguma
 * coisa comparada ao mercado, e um número solto não diz se 2,1% é bom. A
 * faixa transforma o número em posição, que é a pergunta que o dono do
 * negócio realmente faz.
 */
export function FaixaDePosicao({
  valor,
  minimo,
  maximo,
  rotuloMinimo,
  rotuloMaximo,
  formatar,
}: {
  valor: number;
  minimo: number;
  maximo: number;
  rotuloMinimo: string;
  rotuloMaximo: string;
  formatar: (v: number) => string;
}) {
  const amplitude = Math.max(maximo - minimo, Number.EPSILON);
  // A marca fica dentro da faixa mesmo quando o valor sai dela; o número
  // exibido continua sendo o real, então nada é escondido.
  const posicao = Math.min(Math.max((valor - minimo) / amplitude, 0), 1);
  const porcento = `${(posicao * 100).toFixed(1)}%`;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative pt-7">
        <span
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-md border border-ouro/30 bg-ouro-fundo px-1.5 py-0.5 text-[11px] font-medium text-ouro-claro numero"
          style={{ left: porcento }}
        >
          {formatar(valor)}
        </span>

        <div className="relative h-1.5 rounded-full bg-superficie-alta">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-ouro-fundo to-ouro"
            style={{ width: porcento }}
          />
          <span
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-fundo bg-ouro"
            style={{ left: porcento }}
          />
        </div>
      </div>

      <div className="flex justify-between text-[11px] leading-tight text-texto-fraco">
        <span>
          <span className="numero block text-texto-suave">
            {formatar(minimo)}
          </span>
          {rotuloMinimo}
        </span>
        <span className="text-right">
          <span className="numero block text-texto-suave">
            {formatar(maximo)}
          </span>
          {rotuloMaximo}
        </span>
      </div>
    </div>
  );
}

/** Cor da nota, compartilhada pelo arco e pelo rótulo — nunca divergem. */
export function corDaNota(nota: number) {
  if (nota >= 70) return { texto: "text-alta", traco: "stroke-alta" };
  if (nota >= 55) return { texto: "text-ouro", traco: "stroke-ouro" };
  if (nota >= 35) return { texto: "text-atencao", traco: "stroke-atencao" };
  return { texto: "text-baixa", traco: "stroke-baixa" };
}

/**
 * Arco da nota do perfil.
 *
 * Nota é escala absoluta de 0 a 100, não posição relativa — por isso arco, e
 * não a faixa de posição. Desenhado em SVG no servidor, sem JavaScript.
 */
export function ArcoDeNota({ nota }: { nota: number }) {
  const raio = 26;
  const circunferencia = 2 * Math.PI * raio;
  // Arco de 270°, começando embaixo à esquerda: sobra de círculo aberto
  // distingue "nota" de "porcentagem completa".
  const arco = circunferencia * 0.75;
  const preenchido = (arco * Math.min(Math.max(nota, 0), 100)) / 100;

  // Girado 135°: o vão de 90° do arco fica embaixo, como mostrador.
  return (
    <svg
      viewBox="0 0 64 64"
      className="size-14 rotate-[135deg]"
      aria-hidden="true"
    >
      <circle
        cx="32"
        cy="32"
        r={raio}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        className="stroke-borda-forte"
        strokeDasharray={`${arco} ${circunferencia}`}
      />
      <circle
        cx="32"
        cy="32"
        r={raio}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        className={corDaNota(nota).traco}
        strokeDasharray={`${preenchido} ${circunferencia}`}
      />
    </svg>
  );
}

/** Como se lê a nota, em palavra. */
export function faixaDaNota(nota: number) {
  if (nota >= 85) return "Excelente";
  if (nota >= 70) return "Muito bom";
  if (nota >= 55) return "Razoável";
  if (nota >= 35) return "Precisa de atenção";
  return "Crítico";
}

/**
 * Barras diárias do período — a forma do movimento, não os valores exatos.
 * Sem eixo de propósito: quem precisa do número exato tem a aba Desempenho.
 */
export function MiniBarras({
  serie,
  className = "",
}: {
  serie: number[];
  className?: string;
}) {
  if (serie.length < 2) return null;

  // Uma barra por dia fica ilegível em 90 dias; agrupa para caber sempre.
  const alvo = 14;
  const tamanho = Math.ceil(serie.length / alvo);
  const grupos: number[] = [];
  for (let i = 0; i < serie.length; i += tamanho) {
    const fatia = serie.slice(i, i + tamanho);
    grupos.push(fatia.reduce((a, b) => a + b, 0) / fatia.length);
  }

  const maximo = Math.max(...grupos, 1);

  return (
    <div
      className={`flex h-12 items-end gap-[3px] ${className}`}
      aria-hidden="true"
    >
      {grupos.map((v, i) => (
        <span
          key={i}
          className="flex-1 rounded-[2px] bg-alta/70"
          style={{ height: `${Math.max((v / maximo) * 100, 6)}%` }}
        />
      ))}
    </div>
  );
}

/** Barra de composição para as fontes de visualização. */
export function LinhaDeFonte({
  icone,
  rotulo,
  valor,
  fracao,
}: {
  icone: NomeDeIcone;
  rotulo: string;
  valor: string;
  fracao: number;
}) {
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5 text-sm">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-superficie-alta text-ouro">
          <Icone nome={icone} className="size-3.5" />
        </span>
        <span className="text-texto-suave">{rotulo}</span>
        <span className="numero ml-auto text-texto">{valor}</span>
        <span className="numero w-12 text-right text-xs text-texto-fraco">
          {percentual(fracao, 0)}
        </span>
      </div>
      <div className="ml-[34px] h-1 rounded-full bg-superficie-alta">
        <div
          className="h-full rounded-full bg-ouro/80"
          style={{ width: `${fracao * 100}%` }}
        />
      </div>
    </li>
  );
}
