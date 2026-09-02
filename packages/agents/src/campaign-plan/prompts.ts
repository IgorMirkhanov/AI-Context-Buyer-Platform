export const CAMPAIGN_PLAN_SYSTEM =
  "Ты узкий агент планирования кампаний контекстной рекламы. Отвечай только валидным JSON без пояснений.";

export function campaignPlanUser(prompt: string): string {
  return `По семантическим кластерам и брифу составь план кампаний: сколько кампаний, зачем каждая, какие группы объявлений внутри (каждая группа = один или несколько cluster_names из входа). Не придумывай кластеры — используй только переданные имена. JSON: {"campaigns":[{"name":"...","rationale":"...","ad_groups":[{"name":"...","cluster_names":["..."]}]}]}.\n${prompt}`;
}
