import { beforeEach, describe, expect, it, vi } from "vitest";

const sugerirPalavrasChave = vi.fn();
const prisma = {
  keywordSuggestion: {
    findMany: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  keyword: { findMany: vi.fn() },
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ia", () => ({ sugerirPalavrasChave }));
vi.mock("@/lib/prisma", () => ({ prisma }));

const { sugestoesDoNegocio, QUANTIDADE_SUGESTOES } = await import("./sugestoes");

const NEGOCIO = {
  id: "b1",
  primaryCategory: "Barbearia",
  city: "Curitiba",
  state: "PR",
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.keywordSuggestion.findMany.mockResolvedValue([]);
  prisma.keyword.findMany.mockResolvedValue([]);
  prisma.keywordSuggestion.deleteMany.mockResolvedValue({ count: 0 });
  prisma.keywordSuggestion.createMany.mockResolvedValue({ count: 0 });
});

describe("sugestoesDoNegocio", () => {
  it("pede dez termos", async () => {
    sugerirPalavrasChave.mockResolvedValue(["a", "b"]);
    await sugestoesDoNegocio(NEGOCIO);
    expect(QUANTIDADE_SUGESTOES).toBe(10);
    expect(sugerirPalavrasChave).toHaveBeenCalledWith("Barbearia", "Curitiba", 10);
  });

  it("não chama a IA quando já há sugestões guardadas", async () => {
    // É a razão de o cache existir: sem ele, cada abertura da tela — inclusive
    // um F5 — custaria uma chamada à Anthropic.
    prisma.keywordSuggestion.findMany.mockResolvedValue([
      { term: "barbearia curitiba" },
    ]);
    const r = await sugestoesDoNegocio(NEGOCIO);
    expect(sugerirPalavrasChave).not.toHaveBeenCalled();
    expect(r).toEqual([{ termo: "barbearia curitiba", jaAdicionado: false }]);
  });

  it("guarda o que gerou, para a próxima abertura não gerar de novo", async () => {
    sugerirPalavrasChave.mockResolvedValue(["corte masculino"]);
    await sugestoesDoNegocio(NEGOCIO);
    expect(prisma.keywordSuggestion.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          {
            businessId: "b1",
            term: "corte masculino",
            contexto: "barbearia|curitiba|pr",
          },
        ],
      }),
    );
  });

  it("marca o termo que o negócio já acompanha", async () => {
    prisma.keywordSuggestion.findMany.mockResolvedValue([
      { term: "Barbearia Curitiba" },
      { term: "corte masculino" },
    ]);
    // Caixa diferente da sugestão: comparar cru marcaria como não adicionado.
    prisma.keyword.findMany.mockResolvedValue([{ term: "barbearia curitiba" }]);

    const r = await sugestoesDoNegocio(NEGOCIO);
    expect(r).toEqual([
      { termo: "Barbearia Curitiba", jaAdicionado: true },
      { termo: "corte masculino", jaAdicionado: false },
    ]);
  });

  it("regera quando a cidade do perfil muda", async () => {
    // O cache é por contexto: sugestão de Curitiba não serve para São Paulo.
    prisma.keywordSuggestion.findMany.mockResolvedValue([]);
    sugerirPalavrasChave.mockResolvedValue(["barbearia sp"]);

    await sugestoesDoNegocio({ ...NEGOCIO, city: "São Paulo", state: "SP" });

    expect(prisma.keywordSuggestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: "b1", contexto: "barbearia|são paulo|sp" },
      }),
    );
    expect(sugerirPalavrasChave).toHaveBeenCalled();
  });

  it("não sugere sem categoria ou cidade", async () => {
    // São o insumo do prompt; chutar renderia termo genérico inútil.
    expect(await sugestoesDoNegocio({ ...NEGOCIO, primaryCategory: null })).toEqual([]);
    expect(await sugestoesDoNegocio({ ...NEGOCIO, city: null })).toEqual([]);
    expect(sugerirPalavrasChave).not.toHaveBeenCalled();
  });

  it("devolve lista vazia quando a IA falha, sem derrubar a página", async () => {
    // A sugestão é acessório da tela; o painel precisa abrir mesmo sem ela.
    sugerirPalavrasChave.mockRejectedValue(new Error("sem chave"));
    await expect(sugestoesDoNegocio(NEGOCIO)).resolves.toEqual([]);
  });
});
