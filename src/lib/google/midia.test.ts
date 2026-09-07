import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiV4IndisponivelError } from "./avaliacoes";
import { listarFotos } from "./midia";

type ItemFalso = {
  formato?: string;
  largura?: number | null;
  altura?: number | null;
  criadaEm?: string;
  semUrl?: boolean;
};

function resposta(itens: ItemFalso[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      mediaItems: itens.map((i, n) => ({
        name: `media/${n}`,
        googleUrl: i.semUrl ? undefined : `https://lh3.googleusercontent.com/${n}`,
        thumbnailUrl: i.semUrl ? undefined : `https://lh3.googleusercontent.com/t${n}`,
        mediaFormat: i.formato ?? "PHOTO",
        locationAssociation: { category: "INTERIOR" },
        dimensions:
          i.largura === null
            ? undefined
            : { widthPixels: i.largura ?? 1200, heightPixels: i.altura ?? 800 },
        createTime: i.criadaEm,
      })),
    }),
  } as unknown as Response;
}

const mock = (r: unknown) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(r));

afterEach(() => vi.unstubAllGlobals());

describe("listarFotos", () => {
  it("traz fotos em paisagem", async () => {
    mock(resposta([{ largura: 1200, altura: 800 }]));
    const fotos = await listarFotos("t", "accounts/1", "locations/2");
    expect(fotos).toHaveLength(1);
    expect(fotos[0].categoria).toBe("INTERIOR");
  });

  it("descarta vídeo", async () => {
    mock(resposta([{ formato: "VIDEO" }]));
    expect(await listarFotos("t", "accounts/1", "locations/2")).toEqual([]);
  });

  it("descarta retrato, que o card corta", async () => {
    mock(resposta([{ largura: 800, altura: 1400 }]));
    expect(await listarFotos("t", "accounts/1", "locations/2")).toEqual([]);
  });

  it("descarta foto pequena, que aparece borrada", async () => {
    mock(resposta([{ largura: 200, altura: 150 }]));
    expect(await listarFotos("t", "accounts/1", "locations/2")).toEqual([]);
  });

  it("aceita foto sem dimensões informadas", async () => {
    // Sem `dimensions` não dá para julgar; descartar perderia foto boa.
    mock(resposta([{ largura: null }]));
    expect(await listarFotos("t", "accounts/1", "locations/2")).toHaveLength(1);
  });

  it("ordena das mais recentes para as mais antigas", async () => {
    // Meio do ano de propósito: 1º de janeiro em UTC cai no ano anterior no
    // fuso local e faria o teste falhar por motivo que não é o testado.
    mock(
      resposta([
        { criadaEm: "2024-06-15T12:00:00Z" },
        { criadaEm: "2026-06-15T12:00:00Z" },
        { criadaEm: "2025-06-15T12:00:00Z" },
      ]),
    );
    const fotos = await listarFotos("t", "accounts/1", "locations/2");
    expect(fotos.map((f) => f.criadaEm?.getFullYear())).toEqual([
      2026, 2025, 2024,
    ]);
  });

  it("respeita o limite pedido", async () => {
    mock(resposta(Array.from({ length: 30 }, () => ({}))));
    expect(await listarFotos("t", "accounts/1", "locations/2", 5)).toHaveLength(5);
  });
});

describe("allowlist da v4", () => {
  it("403 vira erro distinto, para a interface degradar só este módulo", async () => {
    mock({ ok: false, status: 403, text: async () => "denied" });
    await expect(
      listarFotos("t", "accounts/1", "locations/2"),
    ).rejects.toBeInstanceOf(ApiV4IndisponivelError);
  });

  it("404 também: projeto sem a v4 liberada responde assim", async () => {
    mock({ ok: false, status: 404, text: async () => "not found" });
    await expect(
      listarFotos("t", "accounts/1", "locations/2"),
    ).rejects.toBeInstanceOf(ApiV4IndisponivelError);
  });

  it("outros erros sobem como erro comum", async () => {
    mock({ ok: false, status: 500, text: async () => "boom" });
    await expect(
      listarFotos("t", "accounts/1", "locations/2"),
    ).rejects.toThrow(/500/);
  });
});
