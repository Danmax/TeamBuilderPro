(function (root) {
  function validateSurveyQuestions(items) {
    if (!Array.isArray(items)) return [];
    return items.slice(0, 200).flatMap(item => {
      const prompt = String(item?.prompt || '').trim().slice(0, 240);
      if (!prompt || !Array.isArray(item?.answers) || item.answers.length < 2 || item.answers.length > 8) return [];
      const seen = new Set();
      const answers = item.answers.map(answer => ({
        text: String(answer?.text || '').trim().slice(0, 80),
        points: Number(answer?.points),
        aliases: Array.isArray(answer?.aliases) ? answer.aliases.map(value => String(value).trim().slice(0, 80)).filter(Boolean).slice(0, 10) : []
      }));
      for (const answer of answers) {
        const key = answer.text.toLowerCase();
        if (!key || seen.has(key) || !Number.isInteger(answer.points) || answer.points < 1 || answer.points > 100) return [];
        seen.add(key);
      }
      if (answers.reduce((sum, answer) => sum + answer.points, 0) !== 100) return [];
      return [{ prompt, answers }];
    });
  }

  function parseContentJSON(value) {
    const clean = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    return JSON.parse(clean);
  }

  function selectActivityContent(collections, scopedCollections, activityIds, validate, samples) {
    const read = list => (Array.isArray(list) ? list : []).flatMap(collection =>
      activityIds.flatMap(id => validate(collection?.activities?.[id])));
    const scoped = read(scopedCollections);
    if (scoped.length) return scoped;
    const global = read(collections);
    return global.length ? global : samples;
  }

  const api = { validateSurveyQuestions, parseContentJSON, selectActivityContent };
  root.TeamBuilderThemeContent = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
