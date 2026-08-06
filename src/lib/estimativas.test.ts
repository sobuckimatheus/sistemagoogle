import { describe, expect, it } from "vitest";

import { calcularEstimativas, variacao } from "./estimativas";

const BENCHMARK = { avgTicket: 60, avgConversionRate: 0.3 };
const ACOES = { ligacoes: 100, rotas: 50, cliquesNoSite: 30 };
const SEM_CONFIG = { ticketMedio: null, taxaConversao: null };

describe("calcularEstimativas", () => {
  it("soma as três ações que indicam intenção", () => {
    const e = calcularEstimativas(ACOES, 1000, SEM_CONFIG, BENCHMARK);
    expect(e.acoesTotais).toBe(180);
  });

  it("usa o benchmark quando o negócio não configurou nada", () => {
    const e = calcularEstimativas(ACOES, 1000, SEM_CONFIG, BENCHMARK);
    expect(e.ticketUsado).toBe(60);
    expect(e.taxaUsada).toBe(0.3);
    expect(e.usouBenchmark).toEqual({ ticket: true, taxa: true });
  });

  it("prefere os valores do negócio quando existem", () => {
    const e = calcularEstimativas(
      ACOES,
      1000,
      { ticketMedio: 500, taxaConversao: 0.1 },
      BENCHMARK,
    );
    expect(e.ticketUsado).toBe(500);
    expect(e.taxaUsada).toBe(0.1);
    expect(e.usouBenchmark).toEqual({ ticket: false, taxa: false });
    expect(e.receitaAtual).toBe(180 * 0.1 * 500);
  });

  it("aceita configuração parcial", () => {
    const e = calcularEstimativas(
      ACOES,
      1000,
      { ticketMedio: 200, taxaConversao: null },
      BENCHMARK,
    );
    expect(e.usouBenchmark).toEqual({ ticket: false, taxa: true });
  });

  it("devolve conversão nula sem visualizações", () => {
    // Zero sugeriria desempenho ruim; null é ausência de dado, e a interface
    // precisa distinguir as duas coisas.
    const e = calcularEstimativas(ACOES, 0, SEM_CONFIG, BENCHMARK);
    expect(e.conversaoDoPerfil).toBeNull();
  });

  it("nunca reporta receita perdida negativa", () => {
    // Negócio que já converte acima do topo do segmento não está perdendo
    // nada — um número negativo aqui seria absurdo na tela.
    const e = calcularEstimativas(
      ACOES,
      1000,
      { ticketMedio: 100, taxaConversao: 0.99 },
      BENCHMARK,
    );
    expect(e.receitaPerdida).toBeGreaterThanOrEqual(0);
  });

  it("mantém o potencial coerente com o topo do segmento", () => {
    const e = calcularEstimativas(ACOES, 1000, SEM_CONFIG, BENCHMARK);
    // Fator padrão de 1,5x sobre a média, limitado a 100% de conversão.
    expect(e.receitaPotencial).toBeCloseTo(180 * 0.45 * 60, 5);
    expect(e.receitaPerdida).toBeCloseTo(e.receitaPotencial - e.receitaAtual, 5);
  });

  it("respeita o topo informado pelo benchmark", () => {
    const e = calcularEstimativas(ACOES, 1000, SEM_CONFIG, {
      ...BENCHMARK,
      taxaConversaoTopo: 0.4,
    });
    expect(e.receitaPotencial).toBeCloseTo(180 * 0.4 * 60, 5);
  });

  it("não deixa a taxa do topo passar de 100%", () => {
    const e = calcularEstimativas(ACOES, 1000, SEM_CONFIG, {
      avgTicket: 60,
      avgConversionRate: 0.9, // 0,9 × 1,5 = 1,35 → precisa ser truncado
    });
    expect(e.receitaPotencial).toBeCloseTo(180 * 1 * 60, 5);
  });

  it("zera tudo sem ações, sem quebrar", () => {
    const e = calcularEstimativas(
      { ligacoes: 0, rotas: 0, cliquesNoSite: 0 },
      0,
      SEM_CONFIG,
      BENCHMARK,
    );
    expect(e.acoesTotais).toBe(0);
    expect(e.receitaAtual).toBe(0);
    expect(e.receitaPerdida).toBe(0);
    expect(e.conversaoDoPerfil).toBeNull();
  });
});

describe("variacao", () => {
  it("calcula crescimento e queda", () => {
    expect(variacao(150, 100)).toBeCloseTo(0.5);
    expect(variacao(50, 100)).toBeCloseTo(-0.5);
  });

  it("devolve null quando não há base de comparação", () => {
    // Dividir por zero renderia Infinity, e mostrar "+∞%" seria pior do que
    // admitir que não há histórico.
    expect(variacao(150, 0)).toBeNull();
  });

  it("devolve zero quando nada mudou", () => {
    expect(variacao(100, 100)).toBe(0);
  });
});
