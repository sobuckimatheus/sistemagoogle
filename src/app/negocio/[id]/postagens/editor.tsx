"use client";

import { useActionState, useState } from "react";

import { gerarTexto, salvarPost, type EstadoPost } from "./acoes";

const campo =
  "rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function EditorPost({ businessId }: { businessId: string }) {
  const [texto, setTexto] = useState("");
  const [agendando, setAgendando] = useState(false);

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
    (estadoIa && "erro" in estadoIa && estadoIa.erro) ||
    (estadoSalvar && "erro" in estadoSalvar && estadoSalvar.erro) ||
    null;
  const ok = estadoSalvar && "ok" in estadoSalvar ? estadoSalvar.ok : null;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
      <h2 className="text-sm font-medium">Nova postagem</h2>

      <form action={acaoIa} className="flex flex-wrap gap-2">
        <input type="hidden" name="businessId" value={businessId} />
        <input
          name="assunto"
          placeholder="Sobre o que é o post? ex.: promoção de terça"
          className={`min-w-56 flex-1 ${campo}`}
        />
        <button
          type="submit"
          disabled={gerando}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
        >
          {gerando ? "Escrevendo…" : "Gerar com IA"}
        </button>
      </form>

      <form action={acaoSalvar} className="flex flex-col gap-3">
        <input type="hidden" name="businessId" value={businessId} />

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
            {texto.length}/1500. O Google corta a exibição por volta de 300 —
            a mensagem principal precisa vir no começo.
          </span>
        </label>

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
            {salvando
              ? "Salvando…"
              : agendando
                ? "Agendar"
                : "Publicar agora"}
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
