"use client";

import { useActionState } from "react";

import { salvarParametros, salvarPerfil, type EstadoPerfil } from "./acoes";

function Aviso({ estado }: { estado: EstadoPerfil }) {
  if (!estado) return null;
  const erro = "erro" in estado;
  return (
    <p
      role={erro ? "alert" : "status"}
      className={`text-sm ${erro ? "text-red-600" : "text-green-700 dark:text-green-400"}`}
    >
      {erro ? estado.erro : estado.ok}
    </p>
  );
}

const campo =
  "rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function FormularioPerfil({
  businessId,
  inicial,
}: {
  businessId: string;
  inicial: {
    title: string;
    phone: string;
    website: string;
    description: string;
  };
}) {
  const [estado, acao, pendente] = useActionState<EstadoPerfil, FormData>(
    salvarPerfil,
    null,
  );

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="businessId" value={businessId} />

      <label className="flex flex-col gap-1 text-sm">
        Nome do negócio
        <input name="title" defaultValue={inicial.title} required className={campo} />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Telefone
          <input
            name="phone"
            defaultValue={inicial.phone}
            placeholder="+55 11 99999-9999"
            className={campo}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Site
          <input
            name="website"
            type="url"
            defaultValue={inicial.website}
            placeholder="https://"
            className={campo}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Descrição
        <textarea
          name="description"
          rows={5}
          maxLength={750}
          defaultValue={inicial.description}
          className={campo}
        />
        <span className="text-xs text-neutral-500">
          Máximo de 750 caracteres. Acima de 250 a auditoria considera o campo
          bem aproveitado.
        </span>
      </label>

      <Aviso estado={estado} />

      <button
        type="submit"
        disabled={pendente}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pendente ? "Salvando no Google…" : "Salvar no Google"}
      </button>
    </form>
  );
}

export function FormularioParametros({
  businessId,
  ticketMedio,
  taxaConversao,
  tomDeVoz,
}: {
  businessId: string;
  ticketMedio: number | null;
  taxaConversao: number | null;
  tomDeVoz: string | null;
}) {
  const [estado, acao, pendente] = useActionState<EstadoPerfil, FormData>(
    salvarParametros,
    null,
  );

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="businessId" value={businessId} />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Ticket médio (R$)
          <input
            name="ticketMedio"
            inputMode="decimal"
            defaultValue={ticketMedio ?? ""}
            placeholder="ex.: 180"
            className={campo}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Taxa de conversão (%)
          <input
            name="taxaConversao"
            inputMode="decimal"
            defaultValue={taxaConversao !== null ? taxaConversao * 100 : ""}
            placeholder="ex.: 25"
            className={campo}
          />
        </label>
      </div>

      <p className="text-xs text-neutral-500">
        Deixe em branco para usar a referência da categoria. Quanto mais
        próximos da sua realidade, mais confiável fica a estimativa de receita
        — e é justamente esse número que o cliente questiona primeiro.
      </p>

      <label className="flex flex-col gap-1 text-sm">
        Tom de voz nas gerações de IA
        <textarea
          name="tomDeVoz"
          rows={3}
          maxLength={500}
          defaultValue={tomDeVoz ?? ""}
          placeholder="ex.: informal e próximo, tratando o cliente por você, sem gírias"
          className={campo}
        />
        <span className="text-xs text-neutral-500">
          Vale para rascunhos de resposta a avaliação e textos de postagem. Em
          branco, a IA usa um tom cordial neutro.
        </span>
      </label>

      <Aviso estado={estado} />

      <button
        type="submit"
        disabled={pendente}
        className="self-start rounded-md border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
      >
        {pendente ? "Salvando…" : "Salvar parâmetros"}
      </button>
    </form>
  );
}
