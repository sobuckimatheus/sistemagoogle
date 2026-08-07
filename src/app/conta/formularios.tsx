"use client";

import { useActionState } from "react";

import {
  alterarPapel,
  convidarMembro,
  removerMembro,
  renomearConta,
  revogarConvite,
  salvarNotificacoes,
  type EstadoConta,
} from "./acoes";

const campo =
  "rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

const botao =
  "rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900";

const botaoDiscreto =
  "rounded-md border border-neutral-300 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-neutral-700";

function Aviso({ estado }: { estado: EstadoConta }) {
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

export function FormularioNome({
  nome,
  podeEditar,
}: {
  nome: string;
  podeEditar: boolean;
}) {
  const [estado, acao, pendente] = useActionState<EstadoConta, FormData>(
    renomearConta,
    null,
  );

  return (
    <form action={acao} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Nome da conta
        <input
          name="nome"
          defaultValue={nome}
          disabled={!podeEditar}
          required
          className={campo}
        />
      </label>
      <Aviso estado={estado} />
      {podeEditar && (
        <button type="submit" disabled={pendente} className={`self-start ${botao}`}>
          {pendente ? "Salvando…" : "Salvar"}
        </button>
      )}
    </form>
  );
}

export function FormularioConvite() {
  const [estado, acao, pendente] = useActionState<EstadoConta, FormData>(
    convidarMembro,
    null,
  );

  return (
    <form action={acao} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          E-mail
          <input
            name="email"
            type="email"
            required
            placeholder="pessoa@empresa.com"
            className={campo}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Papel
          <select name="role" defaultValue="MEMBER" className={campo}>
            <option value="MEMBER">Membro (só visualiza)</option>
            <option value="OWNER">Dono (administra)</option>
          </select>
        </label>
        <button type="submit" disabled={pendente} className={botao}>
          {pendente ? "Enviando…" : "Convidar"}
        </button>
      </div>
      <Aviso estado={estado} />
    </form>
  );
}

export function AcoesDoMembro({
  memberId,
  papel,
  ehVoce,
}: {
  memberId: string;
  papel: "OWNER" | "MEMBER";
  ehVoce: boolean;
}) {
  const [estadoPapel, acaoPapel, papelPendente] = useActionState<
    EstadoConta,
    FormData
  >(alterarPapel, null);
  const [estadoRemocao, acaoRemocao, remocaoPendente] = useActionState<
    EstadoConta,
    FormData
  >(removerMembro, null);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <form action={acaoPapel}>
          <input type="hidden" name="memberId" value={memberId} />
          <input
            type="hidden"
            name="role"
            value={papel === "OWNER" ? "MEMBER" : "OWNER"}
          />
          <button type="submit" disabled={papelPendente} className={botaoDiscreto}>
            {papel === "OWNER" ? "Tornar membro" : "Tornar dono"}
          </button>
        </form>

        {!ehVoce && (
          <form action={acaoRemocao}>
            <input type="hidden" name="memberId" value={memberId} />
            <button
              type="submit"
              disabled={remocaoPendente}
              className={`${botaoDiscreto} text-red-600`}
            >
              Remover
            </button>
          </form>
        )}
      </div>
      <Aviso estado={estadoPapel} />
      <Aviso estado={estadoRemocao} />
    </div>
  );
}

export function BotaoRevogar({ inviteId }: { inviteId: string }) {
  const [estado, acao, pendente] = useActionState<EstadoConta, FormData>(
    revogarConvite,
    null,
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={acao}>
        <input type="hidden" name="inviteId" value={inviteId} />
        <button type="submit" disabled={pendente} className={botaoDiscreto}>
          {pendente ? "Revogando…" : "Revogar"}
        </button>
      </form>
      <Aviso estado={estado} />
    </div>
  );
}

export function FormularioNotificacoes({ receber }: { receber: boolean }) {
  const [estado, acao, pendente] = useActionState<EstadoConta, FormData>(
    salvarNotificacoes,
    null,
  );

  return (
    <form action={acao} className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="emailOnCriticalAlert"
          defaultChecked={receber}
          className="size-4"
        />
        Receber e-mail quando um alerta crítico for gerado
      </label>
      <Aviso estado={estado} />
      <button type="submit" disabled={pendente} className={`self-start ${botaoDiscreto}`}>
        {pendente ? "Salvando…" : "Salvar preferência"}
      </button>
    </form>
  );
}
