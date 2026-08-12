// langs/*.json is classic's vue-i18n catalogue, reused verbatim so both apps stay in sync on
// copy. Two of vue-i18n's features have no i18next equivalent, so they are resolved by hand:
//
//   - `{name}` placeholders. i18next's interpolation expects `{{name}}`, and rewriting the
//     catalogue would fork it from the parent project.
//   - `zero | one | other` pipe-separated plurals ($tc), vs i18next's `_plural` key suffixes.
//
// Both used to be reimplemented inline in each component that needed them (three near-identical
// copies of the plural parser alone); this is the single implementation they now share.

export const interpolate = (template: string, values: Record<string, string | number>): string =>
  Object.entries(values).reduce(
    (result, [name, value]) => result.split(`{${name}}`).join(String(value)),
    template
  )

// Mirrors vue-i18n's $tc. Falls back to the nearest defined form so a catalogue entry with
// fewer than three variants (or an empty one) still renders something sensible.
export const formatPipePlural = (template: string, count: number): string => {
  const forms = template.split('|').map((form) => form.trim())
  const form =
    count === 0
      ? forms[0]
      : count === 1
        ? forms[1] ?? forms[0]
        : forms[2] ?? forms[forms.length - 1]

  return interpolate(form ?? '', { n: count })
}
