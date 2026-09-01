/**
 * Métricas estimadas do dashboard (seção 5.9 do PRD).
 *
 * ⚠️ Nada aqui vem do Google. São fórmulas aplicadas sobre dados reais para
 * traduzir métricas de perfil em linguagem de negócio. O PRD marca isso como
 * risco de credibilidade: se a estimativa destoar da realidade do cliente, o
 * produto inteiro perde confiança.
 *
 * Por isso o módulo é puro e isolado — dá para ajustar a fórmula sem caçar
 * lógica espalhada pela interface, e dá para testar caso de borda.
 *
 * Toda tela que exibir estes números deve linkar a explicação da fórmula.
 */

export type AcoesDoPerfil = {
  ligacoes: number;
  rotas: number;
  cliquesNoSite: number;
};

export type ParametrosNegocio = {
  /** Configurado pelo usuário; se ausente, usa o benchmark da categoria. */
  ticketMedio: number | null;
  /** Configurado pelo usuário; se ausente, usa o benchmark da categoria. */
  taxaConversao: number | null;
};

export type Benchmark = {
  avgTicket: number;
  avgConversionRate: number;
  /** Conversão do topo do segmento, usada para calcular o que se deixa na mesa. */
  taxaConversaoTopo?: number;
};

export type Estimativas = {
  acoesTotais: number;
  clientesEstimados: number;
  receitaAtual: number;
  receitaPotencial: number;
  receitaPerdida: number;
  conversaoDoPerfil: number | null;
  conversaoDoSegmento: number;
  /** Conversão do topo do segmento — o alvo que define a receita potencial. */
  conversaoDoTopo: number;
  ticketUsado: number;
  taxaUsada: number;
  usouBenchmark: { ticket: boolean; taxa: boolean };
};

/**
 * Quanto o topo do segmento converte melhor que a média, quando o benchmark
 * não traz esse número. 1,5x é conservador de propósito: superestimar o
 * potencial infla a "receita perdida" e destrói a credibilidade do número.
 */
const FATOR_TOPO_PADRAO = 1.5;

export function calcularEstimativas(
  acoes: AcoesDoPerfil,
  visualizacoes: number,
  negocio: ParametrosNegocio,
  benchmark: Benchmark,
): Estimativas {
  const acoesTotais = acoes.ligacoes + acoes.rotas + acoes.cliquesNoSite;

  const ticketUsado = negocio.ticketMedio ?? benchmark.avgTicket;
  const taxaUsada = negocio.taxaConversao ?? benchmark.avgConversionRate;

  const clientesEstimados = acoesTotais * taxaUsada;
  const receitaAtual = clientesEstimados * ticketUsado;

  // O potencial mede a mesma audiência convertendo como o topo do segmento —
  // não uma audiência maior. Isso mantém a comparação honesta: o que está em
  // jogo é eficiência do perfil, não investimento em mídia.
  const taxaTopo =
    benchmark.taxaConversaoTopo ?? benchmark.avgConversionRate * FATOR_TOPO_PADRAO;
  const receitaPotencial = acoesTotais * Math.min(taxaTopo, 1) * ticketUsado;

  return {
    acoesTotais,
    clientesEstimados,
    receitaAtual,
    receitaPotencial,
    // Nunca negativa: quem já converte acima do topo do segmento não está
    // "perdendo" nada, e um número negativo aqui seria absurdo na tela.
    receitaPerdida: Math.max(0, receitaPotencial - receitaAtual),
    // Sem visualização não há conversão a calcular — devolver 0 sugeriria
    // desempenho ruim onde na verdade não há dado.
    conversaoDoPerfil: visualizacoes > 0 ? acoesTotais / visualizacoes : null,
    conversaoDoSegmento: benchmark.avgConversionRate,
    conversaoDoTopo: Math.min(taxaTopo, 1),
    ticketUsado,
    taxaUsada,
    usouBenchmark: {
      ticket: negocio.ticketMedio === null,
      taxa: negocio.taxaConversao === null,
    },
  };
}

/** Variação percentual entre dois períodos, para os cards de comparação. */
export function variacao(atual: number, anterior: number): number | null {
  // Sem base de comparação, não existe percentual — devolver 0 ou 100 seria
  // inventar informação. A interface deve mostrar "sem histórico".
  if (anterior === 0) return null;
  return (atual - anterior) / anterior;
}
