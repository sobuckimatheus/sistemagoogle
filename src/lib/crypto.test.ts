import { describe, expect, it } from "vitest";

import { criptografar, descriptografar, segredoConfere } from "./crypto";

const TOKEN = "ya29.a0AfH6SM-token-de-acesso-do-google";

describe("criptografar / descriptografar", () => {
  it("faz round-trip", () => {
    expect(descriptografar(criptografar(TOKEN))).toBe(TOKEN);
  });

  it("não deixa o texto puro aparecer no valor armazenado", () => {
    expect(criptografar(TOKEN)).not.toContain("ya29");
  });

  it("usa IV novo a cada chamada", () => {
    // Cifras iguais para o mesmo texto vazariam que dois registros guardam o
    // mesmo segredo.
    expect(criptografar(TOKEN)).not.toBe(criptografar(TOKEN));
  });

  it("grava com prefixo de versão em quatro partes", () => {
    const partes = criptografar(TOKEN).split(".");
    expect(partes).toHaveLength(4);
    expect(partes[0]).toBe("v1");
  });

  it("detecta adulteração da cifra", () => {
    const partes = criptografar(TOKEN).split(".");
    partes[3] = Buffer.from("outra-coisa").toString("base64url");
    expect(() => descriptografar(partes.join("."))).toThrow();
  });

  it("detecta adulteração da tag de autenticação", () => {
    const partes = criptografar(TOKEN).split(".");
    partes[2] = Buffer.alloc(16, 1).toString("base64url");
    expect(() => descriptografar(partes.join("."))).toThrow();
  });

  it("recusa versão desconhecida", () => {
    const partes = criptografar(TOKEN).split(".");
    partes[0] = "v2";
    expect(() => descriptografar(partes.join("."))).toThrow(/versão/i);
  });

  it("recusa formato inválido", () => {
    expect(() => descriptografar("qualquer-coisa")).toThrow(/formato/i);
  });

  it("preserva acentuação e emoji", () => {
    const texto = "ação · coração 🎉";
    expect(descriptografar(criptografar(texto))).toBe(texto);
  });

  it("lida com string vazia", () => {
    expect(descriptografar(criptografar(""))).toBe("");
  });
});

describe("segredoConfere", () => {
  it("aceita valores iguais", () => {
    expect(segredoConfere("abc123", "abc123")).toBe(true);
  });

  it("recusa valores diferentes de mesmo tamanho", () => {
    expect(segredoConfere("abc123", "abc124")).toBe(false);
  });

  it("recusa tamanhos diferentes sem lançar", () => {
    // timingSafeEqual lança se os buffers tiverem tamanhos distintos; a
    // função precisa tratar isso antes.
    expect(segredoConfere("curto", "bem-mais-longo")).toBe(false);
  });

  it("recusa string vazia contra segredo real", () => {
    expect(segredoConfere("", "segredo")).toBe(false);
  });
});
