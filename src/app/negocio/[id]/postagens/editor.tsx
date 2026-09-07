"use client";

import Image from "next/image";
import { useActionState, useState } from "react";

import {
  gerarSugestao,
  gerarTexto,
  salvarPost,
  type EstadoPost,
  type EstadoSugestao,
  type FotoEscolhivel,
} from "./acoes";

const campo =
  "rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function EditorPost({ businessId }: { businessId: string }) {
  const [texto, setTexto] = useState("");
  const [agendando, setAgendando] = useState(false);
  const [fotos, setFotos] = useState<FotoEscolhivel[]>([]);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [motivoSemFotos, setMotivoSemFotos] = useState<
    "nenhuma" | "v4-indisponivel" | null
  >(null);
  const [urlPropria, setUrlPropria] = useState("");

  const [estadoSugestao, acaoSugerir, sugerindo] = useActionState<
    EstadoSugestao,
    FormData
  >(async (anterior, fd) => {
    const r = await gerarSugestao(anterior, fd);
    if (r && !("erro" in r)) {
      setTexto(r.texto);
      setFotos(r.fotos);
      setMotivoSemFotos(r.motivoSemFotos);
      setEscolhida(r.fotos[0]?.url ?? null);
    }
    return r;
  }, null);

  const [estadoIa, acaoIa, gerando] = useActionState<EstadoPost, FormData>(
    async (anterior, fd) => {
      const r = await gerarTexto(anterior, fd);
      if (r && "texto" in r) setTexto(r.texto);
      return r;
    },
    null,
  );

  const [estadoSalvar, acaoSalvar, salvando] = useActionState<
    EstadoPost,
    FormData
  >(salvarPost, null);

  const erro =
    (estadoSugestao && "erro" in estadoSugestao && estadoSugestao.erro) ||
    (estadoIa && "erro" in estadoIa && estadoIa.erro) ||
    (estadoSalvar && "erro" in estadoSalvar && estadoSalvar.erro) ||
    null;
  const ok = estadoSalvar && "ok" in estadoSalvar ? estadoSalvar.ok : null;

  const imagemFinal = urlPropria.trim() || escolhida || "";

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Nova postagem</h2>
        <form action={acaoSugerir}>
          <input type="hidden" name="businessId" value={businessId} />
          <button
            type="submit"
            disabled={sugerindo}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {sugerindo ? "Gerando…" : "Gerar postagem"}
          </button>
        </form>
      </div>

      <p className="text-xs text-neutral-500">
        A sugestão usa seus termos de busca para escolher o assunto e traz as
        fotos do seu perfil. Tudo é rascunho — revise o texto e escolha a
        imagem antes de publicar.
      </p>

      <form action={acaoIa} className="flex flex-wrap gap-2">
        <input type="hidden" name="businessId" value={businessId} />
        <input
          name="assunto"
          placeholder="Ou diga o assunto: ex. promoção de terça"
          className={`min-w-56 flex-1 ${campo}`}
        />
        <button
          type="submit"
          disabled={gerando}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
        >
          {gerando ? "Escrevendo…" : "Gerar só o texto"}
        </button>
      </form>

      <form action={acaoSalvar} className="flex flex-col gap-3">
        <input type="hidden" name="businessId" value={businessId} />
        <input type="hidden" name="mediaUrl" value={imagemFinal} />

        <label className="flex flex-col gap-1 text-sm">
          Texto
          <textarea
            name="summary"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={4}
            maxLength={1500}
            required
            className={campo}
          />
          <span className="text-xs text-neutral-500">
            {texto.length}/1500. O Google corta a exibição por volta de 300 — a
            mensagem principal precisa vir no começo.
          </span>
        </label>

        <fieldset className="flex flex-col gap-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
          <legend className="px-1 text-xs font-medium">Imagem</legend>

          {fotos.length > 0 && (
            <>
              <p className="text-xs text-neutral-500">
                Fotos do seu perfil no Google. São suas e mostram o seu espaço
                — funcionam melhor no card do que qualquer foto de acervo.
              </p>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {fotos.map((foto) => {
                  const ativa = !urlPropria.trim() && escolhida === foto.url;
                  return (
                    <li key={foto.url}>
                      <button
                        type="button"
                        onClick={() =>
                          setEscolhida(escolhida === foto.url ? null : foto.url)
                        }
                        className={`flex w-full flex-col gap-1 rounded-md border p-1 text-left ${
                          ativa
                            ? "border-neutral-900 ring-1 ring-neutral-900 dark:border-white dark:ring-white"
                            : "border-neutral-200 dark:border-neutral-800"
                        }`}
                      >
                        <Image
                          src={foto.miniatura}
                          alt={foto.categoria ?? "Foto do perfil"}
                          width={foto.largura ?? 400}
                          height={foto.altura ?? 300}
                          unoptimized
                          className="h-20 w-full rounded object-cover"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {motivoSemFotos === "nenhuma" && (
            <p className="text-xs text-neutral-500">
              Seu perfil ainda não tem fotos em paisagem. Adicione fotos no
              Google Meu Negócio — elas aparecerão aqui — ou use o campo
              abaixo.
            </p>
          )}
          {motivoSemFotos === "v4-indisponivel" && (
            <p className="text-xs text-neutral-500">
              Não conseguimos ler as fotos do seu perfil agora. Use o campo
              abaixo, ou publique sem imagem.
            </p>
          )}

          <label className="flex flex-col gap-1 text-sm">
            Ou usar outra imagem
            <input
              type="url"
              value={urlPropria}
              onChange={(e) => setUrlPropria(e.target.value)}
              placeholder="https://… endereço público da imagem"
              className={campo}
            />
            <span className="text-xs text-neutral-500">
              Preenchido aqui, tem preferência sobre a foto selecionada acima.
            </span>
          </label>
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={agendando}
            onChange={(e) => setAgendando(e.target.checked)}
          />
          Agendar para depois
        </label>

        {agendando && (
          <label className="flex flex-col gap-1 text-sm">
            Data e hora
            <input
              type="datetime-local"
              name="scheduledFor"
              className={campo}
              required
            />
          </label>
        )}

        {erro && (
          <p role="alert" className="text-sm text-red-600">
            {erro}
          </p>
        )}
        {ok && (
          <p role="status" className="text-sm text-green-700 dark:text-green-400">
            {ok}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="acao"
            value={agendando ? "agendar" : "publicar"}
            disabled={salvando || !texto.trim()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {salvando ? "Salvando…" : agendando ? "Agendar" : "Publicar agora"}
          </button>
          <button
            type="submit"
            name="acao"
            value="rascunho"
            disabled={salvando || !texto.trim()}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
          >
            Salvar rascunho
          </button>
        </div>
      </form>
    </section>
  );
}
