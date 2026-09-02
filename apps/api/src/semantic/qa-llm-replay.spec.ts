import {
  createSemanticQaReplayFetch,
  loadSemanticLlmReplay,
} from "./qa-llm-replay";
import path from "path";

describe("qa-llm-replay", () => {
  const replayDir = path.join(__dirname, "../../../../qa/semantic/llm-replay-ideal");

  it("returns near-intent phrases from recorded fixture", async () => {
    const replay = loadSemanticLlmReplay(replayDir, "orthodontics-clinic");
    const fetchImpl = createSemanticQaReplayFetch(replay);
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content:
              'По брифу и уже найденным ключам Wordstat предложи до 12 дополнительных коммерческих поисковых фраз на русском (разговорные формулировки, синонимы «цена/стоимость», глагольные CTA вроде «записаться»). Не дублируй wordstatPhrases. JSON: {"phrases":["..."]}.\n{"brief":{},"wordstatPhrases":[]}',
          },
        ],
      }),
    });
    const raw = await res.text();
    const body = JSON.parse(raw) as {
      content: Array<{ text: string }>;
    };
    const parsed = JSON.parse(body.content[0].text) as { phrases: string[] };
    expect(parsed.phrases).toContain("брекеты для взрослых");
    expect(parsed.phrases).toHaveLength(4);
  });
});
