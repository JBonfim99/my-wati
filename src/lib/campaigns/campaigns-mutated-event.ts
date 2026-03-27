/** Disparado após criar/cancelar campanha para a listagem refazer fetch. */
export const CAMPAIGNS_LIST_MUTATED_EVENT = "mywati:campaigns-list-mutated";

export function dispatchCampaignsListMutated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CAMPAIGNS_LIST_MUTATED_EVENT));
}
