const formatador = new Intl.NumberFormat("pt-BR");

export const dinheiro = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export function percentual(v: number, casas = 1) {
  return `${(v * 100).toFixed(casas).replace(".", ",")}%`;
}

export function CartaoMetrica({
  titulo,
  valor,
  variacao,
  sufixo,
  temHistorico,
}: {
  titulo: string;
  valor: number | string | null;
  variacao?: number | null;
  sufixo?: string;
  temHistorico: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <span className="text-xs text-neutral-500">{titulo}</span>
      <span className="text-2xl font-semibold tabular-nums">
        {valor === null
          ? "—"
          : typeof valor === "number"
            ? formatador.format(valor)
            : valor}
        {sufixo && (
          <span className="text-base font-normal text-neutral-500">
            {sufixo}
          </span>
        )}
      </span>
      <Variacao valor={variacao} temHistorico={temHistorico} />
    </div>
  );
}

function Variacao({
  valor,
  temHistorico,
}: {
  valor: number | null | undefined;
  temHistorico: boolean;
}) {
  // Distinguir "não mudou" de "não há com o que comparar" evita o pior erro
  // do dashboard: exibir uma variação inventada como se fosse medição.
  if (!temHistorico || valor === null || valor === undefined) {
    return (
      <span className="text-xs text-neutral-400">
        sem período anterior para comparar
      </span>
    );
  }

  const positivo = valor >= 0;
  return (
    <span
      className={`text-xs tabular-nums ${
        positivo
          ? "text-green-700 dark:text-green-400"
          : "text-red-700 dark:text-red-400"
      }`}
    >
      {positivo ? "▲" : "▼"} {percentual(Math.abs(valor))} vs. período anterior
    </span>
  );
}
