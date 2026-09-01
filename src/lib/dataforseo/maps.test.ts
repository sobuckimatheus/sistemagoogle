import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rankingPeloDataForSeo } from "@/lib/dataforseo/maps";

/**
 * Tradução da resposta do DataForSEO.
 *
 * O caso que motivou estes testes apareceu em uso real: um ponto do anel de
 * medição caiu numa área sem nada, a API devolveu `40102 — No Search
 * Results`, e a verificação inteira morreu. "O Google não tem resultado aqui"
 * é um fato sobre o mercado, não uma falha da integração.
 */

function respostaCom(corpo: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(corpo),
  } as Response;
}

beforeEach(() => {
  process.env.DATAFORSEO_AUTH = "Basic credencial-de-teste";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rankingPeloDataForSeo", () => {
  it("traduz os resultados preservando a ordem do Google", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respostaCom({
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              result: [
                {
                  items: [
                    {
                      rank_absolute: 1,
                      title: "Pizzaria A",
                      place_id: "abc",
                      rating: { value: 4.8, votes_count: 120 },
                      address: "Rua X",
                      category: "Pizzaria",
                      main_image: "https://exemplo/foto.jpg",
                    },
                    { rank_absolute: 2, title: "Pizzaria B" },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    );

    const ranking = await rankingPeloDataForSeo("pizzaria", -27, -52);

    expect(ranking).toHaveLength(2);
    expect(ranking[0]).toMatchObject({
      posicao: 1,
      titulo: "Pizzaria A",
      placeId: "abc",
      nota: 4.8,
      totalAvaliacoes: 120,
      foto: "https://exemplo/foto.jpg",
    });
    // Campo ausente vira nulo, nunca zero: zero seria uma afirmação.
    expect(ranking[1].nota).toBeNull();
    expect(ranking[1].foto).toBeNull();
  });

  it("trata 'No Search Results' como lista vazia, não como erro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respostaCom({
          status_code: 20000,
          tasks: [{ status_code: 40102, status_message: "No Search Results." }],
        }),
      ),
    );

    // Um ponto sem resultado não pode derrubar a medição dos outros oito.
    await expect(
      rankingPeloDataForSeo("pizzaria", -30, -40),
    ).resolves.toEqual([]);
  });

  it("propaga recusa real da API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respostaCom({
          status_code: 40200,
          status_message: "Payment Required.",
        }),
      ),
    );

    await expect(
      rankingPeloDataForSeo("pizzaria", -27, -52),
    ).rejects.toThrow(/40200/);
  });

  it("propaga saldo insuficiente na tarefa", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respostaCom({
          status_code: 20000,
          tasks: [{ status_code: 40201, status_message: "Not Enough Money." }],
        }),
      ),
    );

    await expect(
      rankingPeloDataForSeo("pizzaria", -27, -52),
    ).rejects.toThrow(/40201/);
  });
});
