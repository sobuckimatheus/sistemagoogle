import { Icone, type NomeDeIcone } from "@/components/lumora/icones";
import { numero, Variacao } from "@/components/lumora/primitivos";

// Os formatadores vivem em primitivos; reexportados aqui porque o relatório
// já os importa deste caminho.
export { dinheiro, percentual } from "@/components/lumora/primitivos";

/**
 * Cartão da faixa de métricas do topo.
 *
 * Todos os cartões da faixa dividem uma linha só, sem borda entre eles: são
 * uma leitura contínua do período, não seis blocos independentes.
 */
export function CartaoMetrica({
  titulo,
  icone,
  valor,
  variacao,
  sufixo,
  rodape,
  temHistorico,
}: {
  titulo: string;
  icone: NomeDeIcone;
  valor: number | string | null;
  variacao?: number | null;
  sufixo?: string;
  rodape?: React.ReactNode;
  temHistorico: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 px-5 py-4">
      <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-texto-fraco">
        <Icone nome={icone} className="size-4" />
        {titulo}
      </p>

      <p className="numero text-[28px] font-semibold leading-none text-texto">
        {valor === null
          ? "—"
          : typeof valor === "number"
            ? numero.format(valor)
            : valor}
        {sufixo && (
          <span className="text-base font-normal text-texto-fraco">
            {sufixo}
          </span>
        )}
      </p>

      {rodape ?? <Variacao valor={variacao} temHistorico={temHistorico} />}
    </div>
  );
}
