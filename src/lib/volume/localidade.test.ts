import { describe, expect, it } from "vitest";

import { localidadeDoNegocio, siglaDoEstado } from "./localidade";

describe("siglaDoEstado", () => {
  it("aceita a sigla direto", () => {
    expect(siglaDoEstado("SP")).toBe("SP");
    expect(siglaDoEstado("sp")).toBe("SP");
  });

  it("aceita o nome por extenso, com e sem acento", () => {
    expect(siglaDoEstado("São Paulo")).toBe("SP");
    expect(siglaDoEstado("Sao Paulo")).toBe("SP");
    expect(siglaDoEstado("Espírito Santo")).toBe("ES");
  });

  it("aceita o formato que o Google usa", () => {
    expect(siglaDoEstado("State of Paraná")).toBe("PR");
  });

  it("devolve nulo para o que não reconhece", () => {
    expect(siglaDoEstado(null)).toBeNull();
    expect(siglaDoEstado("")).toBeNull();
    expect(siglaDoEstado("Lisboa")).toBeNull();
  });
});

describe("localidadeDoNegocio", () => {
  it("resolve cidade acentuada, como o GBP devolve", () => {
    // O CSV do Google grava "Sao Paulo"; o perfil devolve "São Paulo". Sem
    // normalizar, toda cidade acentuada falharia — e falharia calada.
    expect(localidadeDoNegocio({ city: "São Paulo", state: "SP" })?.codigo).toBe(
      1001773,
    );
  });

  it("resolve cidade sem acento igualmente", () => {
    expect(localidadeDoNegocio({ city: "Sao Paulo", state: "SP" })?.codigo).toBe(
      1001773,
    );
  });

  it("ignora caixa e espaço sobrando", () => {
    expect(
      localidadeDoNegocio({ city: "  CURITIBA ", state: "pr" })?.codigo,
    ).toBe(1001634);
  });

  it("traz um rótulo para a tela dizer de onde vem o número", () => {
    expect(localidadeDoNegocio({ city: "Curitiba", state: "PR" })?.rotulo).toBe(
      "Curitiba, PR",
    );
  });

  it("resolve sem estado quando o nome é único no país", () => {
    expect(localidadeDoNegocio({ city: "Curitiba", state: null })?.codigo).toBe(
      1001634,
    );
  });

  it("recusa nome ambíguo sem estado, em vez de chutar", () => {
    // Doze nomes de cidade se repetem entre estados (Rio Claro em SP e RJ,
    // Palmas em TO e PR…). Escolher um daria o volume de outra cidade sem
    // nenhum aviso — pior que não responder.
    expect(localidadeDoNegocio({ city: "Rio Claro", state: null })).toBeNull();
    expect(localidadeDoNegocio({ city: "Palmas", state: null })).toBeNull();
    expect(
      localidadeDoNegocio({ city: "Rio Claro", state: "SP" }),
    ).not.toBeNull();
  });

  it("devolve nulo sem cidade", () => {
    expect(localidadeDoNegocio({ city: null, state: "SP" })).toBeNull();
    expect(localidadeDoNegocio({ city: "   ", state: "SP" })).toBeNull();
  });

  it("devolve nulo para cidade fora do Brasil", () => {
    // Nulo faz o volume não ser consultado. Cair para o número nacional
    // devolveria um dado que parece certo e não é.
    expect(localidadeDoNegocio({ city: "Lisboa", state: null })).toBeNull();
  });

  it("não confunde cidade homônima de outro estado", () => {
    const sp = localidadeDoNegocio({ city: "Rio Claro", state: "SP" });
    const rj = localidadeDoNegocio({ city: "Rio Claro", state: "RJ" });
    expect(sp?.codigo).toBeDefined();
    expect(rj?.codigo).toBeDefined();
    expect(sp?.codigo).not.toBe(rj?.codigo);
  });
});
