import "server-only";

const V4 = "https://mybusiness.googleapis.com/v4";

/**
 * Avaliações — API v4, a legada.
 *
 * É a única fonte de avaliações e posts, e tem allowlist **separado** das
 * APIs novas: pode responder 403 mesmo com Account Management e Business
 * Information já liberadas. Por isso o erro é distinto, para a interface
 * poder degradar só este módulo em vez de bloquear o produto inteiro.
 */
export class ApiV4IndisponivelError extends Error {
  constructor() {
    super(
      "A API v4 do Google (avaliações e postagens) ainda não está liberada para este projeto.",
    );
    this.name = "ApiV4IndisponivelError";
  }
}

const ESTRELAS: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export type AvaliacaoGbp = {
  gbpReviewId: string;
  reviewerName: string | null;
  reviewerPhotoUrl: string | null;
  starRating: number | null;
  comment: string | null;
  replyText: string | null;
  repliedAt: Date | null;
  createTime: Date | null;
  updateTime: Date | null;
};

export async function listarAvaliacoes(
  accessToken: string,
  gbpAccountName: string,
  locationName: string,
): Promise<AvaliacaoGbp[]> {
  const avaliacoes: AvaliacaoGbp[] = [];
  let pageToken: string | undefined;

  do {
    // O caminho da v4 é accounts/{a}/locations/{l}/reviews — e locationName
    // já vem como "locations/123", daí a montagem.
    const url = new URL(`${V4}/${gbpAccountName}/${locationName}/reviews`);
    url.searchParams.set("pageSize", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const resposta = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (resposta.status === 403 || resposta.status === 404) {
      throw new ApiV4IndisponivelError();
    }
    if (!resposta.ok) {
      throw new Error(
        `API v4 respondeu ${resposta.status}: ${await resposta.text()}`,
      );
    }

    const dados = (await resposta.json()) as {
      reviews?: {
        reviewId: string;
        reviewer?: { displayName?: string; profilePhotoUrl?: string };
        starRating?: string;
        comment?: string;
        createTime?: string;
        updateTime?: string;
        reviewReply?: { comment?: string; updateTime?: string };
      }[];
      nextPageToken?: string;
    };

    for (const r of dados.reviews ?? []) {
      avaliacoes.push({
        gbpReviewId: r.reviewId,
        reviewerName: r.reviewer?.displayName ?? null,
        reviewerPhotoUrl: r.reviewer?.profilePhotoUrl ?? null,
        starRating: r.starRating ? (ESTRELAS[r.starRating] ?? null) : null,
        comment: r.comment ?? null,
        replyText: r.reviewReply?.comment ?? null,
        repliedAt: r.reviewReply?.updateTime
          ? new Date(r.reviewReply.updateTime)
          : null,
        createTime: r.createTime ? new Date(r.createTime) : null,
        updateTime: r.updateTime ? new Date(r.updateTime) : null,
      });
    }

    pageToken = dados.nextPageToken;
  } while (pageToken);

  return avaliacoes;
}

export async function publicarResposta(
  accessToken: string,
  gbpAccountName: string,
  locationName: string,
  gbpReviewId: string,
  texto: string,
): Promise<void> {
  const resposta = await fetch(
    `${V4}/${gbpAccountName}/${locationName}/reviews/${gbpReviewId}/reply`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ comment: texto }),
    },
  );

  if (resposta.status === 403 || resposta.status === 404) {
    throw new ApiV4IndisponivelError();
  }
  if (!resposta.ok) {
    throw new Error(
      `Falha ao publicar resposta (${resposta.status}): ${await resposta.text()}`,
    );
  }
}
