import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchComRetry } from "./http";

function respostaCom(status: number, headers: Record<string, string> = {}) {
  return new Response("corpo", { status, headers });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchComRetry", () => {
  it("devolve a resposta na primeira tentativa quando dá certo", async () => {
    const espia = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(respostaCom(200));

    const r = await fetchComRetry("https://exemplo.test");

    expect(r.status).toBe(200);
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it("repete em 429 e devolve o sucesso seguinte", async () => {
    const espia = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(respostaCom(429))
      .mockResolvedValueOnce(respostaCom(200));

    const r = await fetchComRetry("https://exemplo.test", undefined, {
      baseMs: 1,
    });

    expect(r.status).toBe(200);
    expect(espia).toHaveBeenCalledTimes(2);
  });

  it("repete em 503", async () => {
    const espia = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(respostaCom(503))
      .mockResolvedValueOnce(respostaCom(200));

    await fetchComRetry("https://exemplo.test", undefined, { baseMs: 1 });
    expect(espia).toHaveBeenCalledTimes(2);
  });

  it("NÃO repete em 400", async () => {
    // Repetir um 400 não muda o resultado e só queima cota.
    const espia = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(respostaCom(400));

    const r = await fetchComRetry("https://exemplo.test", undefined, {
      baseMs: 1,
    });

    expect(r.status).toBe(400);
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it("NÃO repete em 403", async () => {
    const espia = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(respostaCom(403));

    await fetchComRetry("https://exemplo.test", undefined, { baseMs: 1 });
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it("devolve a última resposta quando as tentativas se esgotam", async () => {
    // Devolver em vez de lançar preserva o corpo do erro para quem chamou.
    const espia = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(respostaCom(500));

    const r = await fetchComRetry("https://exemplo.test", undefined, {
      tentativas: 3,
      baseMs: 1,
    });

    expect(r.status).toBe(500);
    expect(espia).toHaveBeenCalledTimes(3);
  });

  it("repete erro de rede e lança se nunca resolver", async () => {
    const espia = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("ECONNRESET"));

    await expect(
      fetchComRetry("https://exemplo.test", undefined, {
        tentativas: 2,
        baseMs: 1,
        api: "SerpApi",
      }),
    ).rejects.toThrow(/SerpApi inacessível após 2 tentativas/);

    expect(espia).toHaveBeenCalledTimes(2);
  });

  it("recupera de um erro de rede isolado", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(respostaCom(200));

    const r = await fetchComRetry("https://exemplo.test", undefined, {
      baseMs: 1,
    });
    expect(r.status).toBe(200);
  });

  it("respeita o Retry-After sem estourar o teto", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(respostaCom(429, { "retry-after": "1000" }))
      .mockResolvedValueOnce(respostaCom(200));

    const inicio = Date.now();
    const r = await fetchComRetry("https://exemplo.test", undefined, {
      baseMs: 1,
      tetoMs: 20,
    });

    // Sem o teto, o Retry-After de 1000 s travaria o job.
    expect(Date.now() - inicio).toBeLessThan(500);
    expect(r.status).toBe(200);
  });
});
