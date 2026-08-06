import { describe, expect, it } from "vitest";

import { auditar, oportunidades, type EntradaAuditoria } from "./auditoria";

const VAZIO: EntradaAuditoria = {
  primaryCategory: null,
  additionalCategories: [],
  description: null,
  phone: null,
  website: null,
  addressLine1: null,
  city: null,
  temHorarios: false,
  temServicos: false,
  totalAvaliacoes: 0,
  notaMedia: null,
  avaliacoesRespondidas: 0,
  postagensUltimos30Dias: 0,
};

const COMPLETO: EntradaAuditoria = {
  primaryCategory: "Barbearia",
  additionalCategories: ["Salão de beleza"],
  description: "x".repeat(300),
  phone: "+5511999999999",
  website: "https://exemplo.com",
  addressLine1: "Rua A, 100",
  city: "São Paulo",
  temHorarios: true,
  temServicos: true,
  totalAvaliacoes: 80,
  notaMedia: 4.8,
  avaliacoesRespondidas: 78,
  postagensUltimos30Dias: 4,
};

describe("auditar", () => {
  it("dá 100 para um perfil completo", () => {
    expect(auditar(COMPLETO).score).toBe(100);
  });

  it("nunca ultrapassa os limites 0–100", () => {
    for (const entrada of [VAZIO, COMPLETO]) {
      const { score } = auditar(entrada);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it("gera um item por critério, sempre", () => {
    expect(auditar(VAZIO).itens).toHaveLength(auditar(COMPLETO).itens.length);
  });

  it("categoria sem secundárias vale parcial, não zero", () => {
    const so = auditar({ ...VAZIO, primaryCategory: "Barbearia" });
    const item = so.itens.find((i) => i.area === "Categorias")!;
    expect(item.pontuacao).toBeGreaterThan(0);
    expect(item.pontuacao).toBeLessThan(1);
    expect(item.status).toBe("atencao");
  });

  it("descrição curta pontua menos que descrição longa", () => {
    const curta = auditar({ ...VAZIO, description: "oi" }).score;
    const longa = auditar({ ...VAZIO, description: "x".repeat(300) }).score;
    expect(longa).toBeGreaterThan(curta);
  });

  it("nota média abaixo de 3 não pontua", () => {
    const ruim = auditar({ ...COMPLETO, notaMedia: 2.5 });
    const item = ruim.itens.find((i) => i.label.startsWith("Nota média"))!;
    expect(item.pontuacao).toBe(0);
  });

  it("perfil sem avaliação nenhuma não é punido por taxa de resposta", () => {
    // 0 de 0 respondidas é 100% — punir aqui seria cobrar por algo que o
    // negócio não tem como fazer.
    const item = auditar(VAZIO).itens.find((i) =>
      i.label.startsWith("Avaliações respondidas"),
    )!;
    expect(item.pontuacao).toBe(1);
  });

  it("responder avaliações aumenta a nota", () => {
    const base = { ...COMPLETO, totalAvaliacoes: 10, avaliacoesRespondidas: 0 };
    const semResposta = auditar(base).score;
    const comResposta = auditar({ ...base, avaliacoesRespondidas: 10 }).score;
    expect(comResposta).toBeGreaterThan(semResposta);
  });
});

describe("oportunidades", () => {
  it("lista apenas o que ainda rende pontos", () => {
    const { itens } = auditar(COMPLETO);
    expect(oportunidades(itens)).toHaveLength(0);
  });

  it("ordena pelo peso que está sendo perdido", () => {
    const { itens } = auditar(VAZIO);
    const lista = oportunidades(itens);

    const perdas = lista.map((i) => i.peso * (1 - i.pontuacao));
    const ordenado = [...perdas].sort((a, b) => b - a);
    expect(perdas).toEqual(ordenado);
  });

  it("põe volume de avaliações no topo de um perfil vazio", () => {
    // É o critério de maior peso entre os zerados; se isso mudar, o bloco
    // "maior oportunidade" do dashboard muda junto.
    const lista = oportunidades(auditar(VAZIO).itens);
    expect(lista[0].area).toBe("Avaliações");
  });
});
