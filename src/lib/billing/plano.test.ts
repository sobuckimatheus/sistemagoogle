import { describe, expect, it } from "vitest";

import {
  motivoDoBloqueio,
  recursosDoStatus,
  statusDoStripe,
} from "@/lib/billing/plano";

/**
 * Regras de acesso por status (E9-05).
 *
 * O critério que estes testes travam: **inadimplência não apaga nem esconde
 * dado**. Se um refactor futuro fizer PAST_DUE ou CANCELED perderem leitura,
 * é aqui que quebra.
 */

describe("recursosDoStatus", () => {
  it("libera tudo em ACTIVE e TRIALING", () => {
    for (const status of ["ACTIVE", "TRIALING"] as const) {
      expect(recursosDoStatus(status)).toEqual({
        leitura: true,
        escrita: true,
        sync: true,
      });
    }
  });

  it("em PAST_DUE mantém leitura e sync, e bloqueia escrita", () => {
    // O sync continua de propósito: o Google não reentrega histórico fora da
    // janela dele, então parar por causa de um cartão vencido é dano
    // permanente.
    expect(recursosDoStatus("PAST_DUE")).toEqual({
      leitura: true,
      escrita: false,
      sync: true,
    });
  });

  it("em CANCELED mantém leitura do histórico", () => {
    expect(recursosDoStatus("CANCELED").leitura).toBe(true);
    expect(recursosDoStatus("CANCELED").escrita).toBe(false);
    expect(recursosDoStatus("CANCELED").sync).toBe(false);
  });

  it("nunca tira a leitura, em nenhum status", () => {
    const todos = ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED"] as const;
    expect(todos.every((s) => recursosDoStatus(s).leitura)).toBe(true);
  });
});

describe("motivoDoBloqueio", () => {
  it("explica a cobrança em PAST_DUE e CANCELED", () => {
    expect(motivoDoBloqueio("PAST_DUE")).toContain("pagamento");
    expect(motivoDoBloqueio("CANCELED")).toContain("cancelada");
  });

  it("é nulo quando não há bloqueio", () => {
    expect(motivoDoBloqueio("ACTIVE")).toBeNull();
    expect(motivoDoBloqueio("TRIALING")).toBeNull();
  });
});

describe("statusDoStripe", () => {
  it("mapeia os estados correntes", () => {
    expect(statusDoStripe("active")).toBe("ACTIVE");
    expect(statusDoStripe("trialing")).toBe("TRIALING");
    expect(statusDoStripe("past_due")).toBe("PAST_DUE");
    expect(statusDoStripe("canceled")).toBe("CANCELED");
  });

  it("trata incomplete como TRIALING para não travar quem está pagando", () => {
    expect(statusDoStripe("incomplete")).toBe("TRIALING");
  });

  it("trata unpaid e incomplete_expired como cobrança que não vai acontecer", () => {
    expect(statusDoStripe("unpaid")).toBe("CANCELED");
    expect(statusDoStripe("incomplete_expired")).toBe("CANCELED");
  });

  it("cai em PAST_DUE diante de status desconhecido, sem destruir acesso", () => {
    const desconhecido = statusDoStripe("estado_novo_do_stripe");
    expect(desconhecido).toBe("PAST_DUE");
    expect(recursosDoStatus(desconhecido).leitura).toBe(true);
    expect(recursosDoStatus(desconhecido).sync).toBe(true);
  });
});
