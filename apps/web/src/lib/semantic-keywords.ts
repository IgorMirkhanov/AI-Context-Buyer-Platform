/** Heuristic commercial intent for Plan UI (before launch editing). */
export function isKeywordCommercial(kw: {
  intent: string;
  phrase: string;
  isCommercial?: boolean;
}): boolean {
  if (kw.isCommercial != null) {
    return kw.isCommercial;
  }
  if (kw.intent === "navigational") {
    return false;
  }
  const phrase = kw.phrase.toLowerCase();
  if (/обзор|отзыв|официальный сайт|википедия/i.test(phrase)) {
    return false;
  }
  if (kw.intent === "hot" || kw.intent === "warm") {
    return true;
  }
  // CIS search commerce — not only «купить/цена»
  return /купить|заказать|записаться|стоимость|цен[аыуе]|недорого|доставк|сколько\s+стоит|наличие|зоомагазин|магазин|товары|корм/i.test(
    phrase,
  );
}
