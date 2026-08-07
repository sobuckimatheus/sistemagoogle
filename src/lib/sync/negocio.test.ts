import { describe, expect, it } from "vitest";

import {
  itensDoSync,
  primeiroErro,
  statusDoSync,
  type ResultadoSync,
} from "@/lib/sync/negocio";

/**
 * Classificação do resultado do sync (E4-02).
 *
 * O que se testa aqui é a fronteira entre PARTIAL e FAILED — é ela que decide
 * se o usuário recebe um alerta crítico. Errar para o lado do FAILED faz o
 * produto gritar todo dia durante as semanas de espera pelo allowlist do
 * Google; errar para o lado do SUCCESS esconde um sync realmente quebrado.
 */

const base = (parcial: Partial<ResultadoSync> = {}): ResultadoSync => ({
  businessId: "b1",
  desempenho: { dias: 5 },
  avaliacoes: { total: 12 },
  auditoria: { score: 70 },
  ...parcial,
});

describe("statusDoSync", () => {
  it("é SUCCESS quando as três etapas passam", () => {
    expect(statusDoSync(base())).toBe("SUCCESS");
  });

  it("é PARTIAL quando só as avaliações falham (allowlist da v4 pendente)", () => {
    const resultado = base({ avaliacoes: { erro: "API v4 sem allowlist" } });
    expect(statusDoSync(resultado)).toBe("PARTIAL");
  });

  it("é PARTIAL com duas etapas falhando", () => {
    const resultado = base({
      desempenho: { erro: "allowlist pendente" },
      avaliacoes: { erro: "API v4 sem allowlist" },
    });
    expect(statusDoSync(resultado)).toBe("PARTIAL");
  });

  it("é FAILED só quando nenhuma etapa produz dado", () => {
    const resultado = base({
      desempenho: { erro: "token revogado" },
      avaliacoes: { erro: "token revogado" },
      auditoria: { erro: "token revogado" },
    });
    expect(statusDoSync(resultado)).toBe("FAILED");
  });
});

describe("itensDoSync", () => {
  it("soma dias de desempenho e avaliações gravadas", () => {
    expect(itensDoSync(base())).toBe(17);
  });

  it("ignora a etapa que falhou em vez de virar NaN", () => {
    expect(itensDoSync(base({ avaliacoes: { erro: "falhou" } }))).toBe(5);
  });

  it("é zero quando nada foi gravado", () => {
    const resultado = base({
      desempenho: { erro: "x" },
      avaliacoes: { erro: "y" },
    });
    expect(itensDoSync(resultado)).toBe(0);
  });
});

describe("primeiroErro", () => {
  it("devolve o erro da primeira etapa que falhou", () => {
    const resultado = base({
      avaliacoes: { erro: "API v4 sem allowlist" },
      auditoria: { erro: "negócio sem categoria" },
    });
    expect(primeiroErro(resultado)).toBe("API v4 sem allowlist");
  });

  it("tem texto de fallback quando não há erro", () => {
    expect(primeiroErro(base())).toBe("motivo não informado");
  });
});
