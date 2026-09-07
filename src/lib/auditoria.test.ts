import { describe, expect, it } from "vitest";

import {
  auditar,
  notaPorFator,
  oportunidades,
  type EntradaAuditoria,
} from "./auditoria";

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
  totalFotos: 0,
  diasDesdeUltimaFoto: null,
  avaliacoesUltimos90Dias: 0,
};

const COMPLETO: EntradaAuditoria = {
  primaryCategory: "Barbearia",
  additionalCategories: ["Salão de beleza", "Barbeiro", "Cabeleireiro"],
  description: "Barbearia em São Paulo com corte masculino e barba.",
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
  totalFotos: 25,
  diasDesdeUltimaFoto: 5,
  avaliacoesUltimos90Dias: 8,
  termosAlvo: ["barbearia", "corte masculino"],
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

  it("postar aumenta a nota", () => {
    // Regressão: postagens eram coletadas pelo sync e nunca pontuadas.
    const sem = auditar({ ...COMPLETO, postagensUltimos30Dias: 0 }).score;
    const com = auditar({ ...COMPLETO, postagensUltimos30Dias: 4 }).score;
    expect(com).toBeGreaterThan(sem);
  });
});

describe("sinais indisponíveis", () => {
  it("saem do denominador em vez de virarem zero", () => {
    // Um perfil impecável cujo dado de horários não foi coletado continua
    // valendo 100: a nota fala do que foi medido.
    const semDado = auditar({
      ...COMPLETO,
      temHorarios: null,
      temServicos: null,
      totalFotos: null,
    });
    expect(semDado.score).toBe(100);
    expect(semDado.naoAvaliados).toContain("Horário de funcionamento");
    expect(semDado.pesoAvaliado).toBeLessThan(100);
  });

  it("distinguem 'não medido' de 'ausente'", () => {
    const naoMedido = auditar({ ...COMPLETO, temHorarios: null });
    const ausente = auditar({ ...COMPLETO, temHorarios: false });
    expect(naoMedido.score).toBeGreaterThan(ausente.score);

    const item = naoMedido.itens.find(
      (i) => i.label === "Horário de funcionamento",
    )!;
    expect(item.status).toBe("indisponivel");
    expect(item.peso).toBe(0);
  });

  it("não viram tarefa no checklist", () => {
    // Não há ação do usuário que resolva um dado que nós não coletamos.
    const { itens } = auditar({ ...VAZIO, temHorarios: null });
    expect(
      oportunidades(itens).some((i) => i.label === "Horário de funcionamento"),
    ).toBe(false);
  });
});

describe("competitividade", () => {
  it("mede o volume contra os concorrentes, não contra número fixo", () => {
    const base = { ...COMPLETO, totalAvaliacoes: 40 };
    const bairro = auditar({
      ...base,
      concorrentes: [
        { totalAvaliacoes: 30, notaMedia: 4.5 },
        { totalAvaliacoes: 35, notaMedia: 4.6 },
      ],
    });
    const avenida = auditar({
      ...base,
      concorrentes: [
        { totalAvaliacoes: 300, notaMedia: 4.7 },
        { totalAvaliacoes: 420, notaMedia: 4.8 },
      ],
    });

    // As mesmas 40 avaliações: suficientes num bairro, pouco numa avenida.
    expect(bairro.score).toBeGreaterThan(avenida.score);
  });

  it("usa mediana, para o concorrente gigante não distorcer a régua", () => {
    const comOutlier = auditar({
      ...COMPLETO,
      totalAvaliacoes: 40,
      concorrentes: [
        { totalAvaliacoes: 30, notaMedia: 4.5 },
        { totalAvaliacoes: 35, notaMedia: 4.5 },
        { totalAvaliacoes: 5000, notaMedia: 4.5 },
      ],
    });
    const item = comOutlier.itens.find((i) =>
      i.label.startsWith("Volume de avaliações"),
    )!;
    // Mediana 35 < 40, então o critério está satisfeito apesar do gigante.
    expect(item.pontuacao).toBe(1);
  });

  it("cobra os termos-alvo na descrição, não o comprimento", () => {
    const comTermo = auditar({
      ...COMPLETO,
      description: "Barbearia com corte masculino no centro.",
      termosAlvo: ["barbearia", "corte masculino"],
    });
    const longaSemTermo = auditar({
      ...COMPLETO,
      description: "x".repeat(700),
      termosAlvo: ["barbearia", "corte masculino"],
    });
    expect(comTermo.score).toBeGreaterThan(longaSemTermo.score);
  });

  it("casa termo ignorando acento e caixa", () => {
    const { itens } = auditar({
      ...COMPLETO,
      description: "SALAO de beleza e barbearia",
      termosAlvo: ["salão de beleza"],
    });
    const item = itens.find((i) => i.label.startsWith("Termos-alvo"))!;
    expect(item.pontuacao).toBe(1);
  });

  it("mede fluxo de avaliações, não só o acervo", () => {
    const parado = auditar({
      ...COMPLETO,
      totalAvaliacoes: 300,
      avaliacoesUltimos90Dias: 0,
    });
    const ativo = auditar({
      ...COMPLETO,
      totalAvaliacoes: 300,
      avaliacoesUltimos90Dias: 8,
    });
    expect(ativo.score).toBeGreaterThan(parado.score);
  });
});

describe("notaPorFator", () => {
  it("separa relevância de destaque", () => {
    // Perfil preenchido mas sem reputação: relevância alta, destaque baixo.
    // As duas notas contam histórias diferentes, e o trabalho é outro.
    const novo = auditar({
      ...COMPLETO,
      totalAvaliacoes: 0,
      notaMedia: null,
      avaliacoesRespondidas: 0,
      avaliacoesUltimos90Dias: 0,
      postagensUltimos30Dias: 0,
      totalFotos: 0,
    });
    const fatores = notaPorFator(novo.itens);
    const relevancia = fatores.find((f) => f.fator === "relevancia")!;
    const destaque = fatores.find((f) => f.fator === "destaque")!;

    expect(relevancia.score).toBeGreaterThan(destaque.score);
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
