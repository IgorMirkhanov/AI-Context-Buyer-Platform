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
  if (/обзор|отзыв|официальный сайт/i.test(kw.phrase)) {
    return false;
  }
  if (kw.intent === "hot") {
    return true;
  }
  return /купить|заказать|записаться|стоимость|цена/i.test(kw.phrase);
}
