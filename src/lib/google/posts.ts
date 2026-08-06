import "server-only";

import { ApiV4IndisponivelError } from "@/lib/google/avaliacoes";
import { fetchComRetry } from "@/lib/http";

const V4 = "https://mybusiness.googleapis.com/v4";

/**
 * Google Posts — API v4.
 *
 * Mesma API das avaliações, e portanto o mesmo allowlist separado: pode negar
 * mesmo com Account Management e Business Information já liberadas.
 */

export type TipoPost = "STANDARD" | "EVENT" | "OFFER";

export type PostParaPublicar = {
  resumo: string;
  tipo: TipoPost;
  urlDaMidia?: string | null;
  /** Obrigatório em EVENT e OFFER. */
  titulo?: string | null;
  inicio?: Date | null;
  fim?: Date | null;
};

function dataHora(d: Date) {
  return {
    date: {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
    },
    time: { hours: d.getUTCHours(), minutes: d.getUTCMinutes() },
  };
}

export async function publicarPost(
  accessToken: string,
  gbpAccountName: string,
  locationName: string,
  post: PostParaPublicar,
): Promise<string> {
  const corpo: Record<string, unknown> = {
    languageCode: "pt-BR",
    summary: post.resumo,
    topicType: post.tipo,
  };

  if (post.urlDaMidia) {
    corpo.media = [{ mediaFormat: "PHOTO", sourceUrl: post.urlDaMidia }];
  }

  // EVENT e OFFER exigem título e janela de datas; sem isso a API recusa com
  // uma mensagem pouco clara sobre "event is required".
  if (post.tipo !== "STANDARD") {
    if (!post.titulo || !post.inicio || !post.fim) {
      throw new Error(
        `Post do tipo ${post.tipo} exige título, data de início e data de fim.`,
      );
    }
    corpo.event = {
      title: post.titulo,
      schedule: {
        startDate: dataHora(post.inicio).date,
        startTime: dataHora(post.inicio).time,
        endDate: dataHora(post.fim).date,
        endTime: dataHora(post.fim).time,
      },
    };
  }

  const resposta = await fetchComRetry(
    `${V4}/${gbpAccountName}/${locationName}/localPosts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(corpo),
    },
    { api: "API v4 (posts)" },
  );

  if (resposta.status === 403 || resposta.status === 404) {
    throw new ApiV4IndisponivelError();
  }

  if (!resposta.ok) {
    throw new Error(
      `Falha ao publicar post (${resposta.status}): ${await resposta.text()}`,
    );
  }

  const dados = (await resposta.json()) as { name?: string };
  return dados.name ?? "";
}
