"use client";

/**
 * Foto de um negócio, com as duas origens possíveis e um estado vazio.
 *
 * O DataForSEO devolve uma URL pronta do Google; a Places API devolve um nome
 * de recurso que só a nossa rota sabe resolver, porque ela guarda a chave.
 * Distinguir pelo prefixo evita carregar um campo a mais só para dizer de
 * onde a imagem veio.
 */
export function urlDaFoto(foto: string): string {
  return foto.startsWith("http")
    ? foto
    : `/api/places/foto?nome=${encodeURIComponent(foto)}`;
}

export function FotoNegocio({
  foto,
  nome,
  tamanho = "md",
  carregando = false,
}: {
  foto: string | null;
  nome: string;
  tamanho?: "sm" | "md";
  carregando?: boolean;
}) {
  const classe = tamanho === "sm" ? "size-11" : "size-16";
  const base = `${classe} shrink-0 rounded-md object-cover`;

  if (carregando) {
    return (
      <div
        aria-hidden
        className={`${classe} shrink-0 animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800`}
      />
    );
  }

  if (!foto) {
    return (
      <div
        aria-hidden
        className={`${classe} flex shrink-0 items-center justify-center rounded-md bg-neutral-100 text-[10px] leading-tight text-neutral-400 dark:bg-neutral-800`}
      >
        sem foto
      </div>
    );
  }

  return (
    /* A imagem vem do Google (DataForSEO) ou da nossa rota, que já faz cache.
       O otimizador do Next exigiria domínios remotos fixos, e aqui a origem
       varia por foto. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={urlDaFoto(foto)}
      alt={`Foto de ${nome}`}
      loading="lazy"
      className={base}
      // Foto quebrada não pode deixar um ícone de imagem partida na tela.
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}
