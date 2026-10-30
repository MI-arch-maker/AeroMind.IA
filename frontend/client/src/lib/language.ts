export type AppLanguage = "fr" | "en";

/**
 * Source unique des libellés d'interface traduits. La valeur française est la clé
 * stable, ce qui rend chaque entrée vérifiable et évite les chaînes de traduction
 * implicites ou les traductions automatiques non contrôlées.
 *
 * CAHIER DES CHARGES 2026-10-30 — Intégration FR/EN parfaite :
 * Les deux langues sont entièrement intégrées. Chaque chaîne française passée
 * à translate() possède une contrepartie anglaise dans en.json. Les clés non
 * trouvées retombent sur le texte français (fallback explicite et documenté).
 */
import frCatalog from "./fr.json";
import enCatalog from "./en.json";

export const languageDictionary = {
  fr: frCatalog,
  en: enCatalog,
} satisfies Record<AppLanguage, Record<string, string>>;
export const reviewedLanguageKeys = Object.keys(languageDictionary.fr);
const englishToFrench = new Map(
  Object.entries(languageDictionary.en).map(([french, english]) => [english, french]),
);
type TrieNode = { next: Map<string, TrieNode>; replacement?: string };
function makeTrie(language: AppLanguage): TrieNode {
  const root: TrieNode = { next: new Map() };
  const add = (source: string, replacement: string) => {
    if (source.length < 2 || source === replacement) return;
    let node = root;
    for (const char of source) {
      let child = node.next.get(char);
      if (!child) { child = { next: new Map() }; node.next.set(char, child); }
      node = child;
    }
    if (!node.replacement || node.replacement === source) node.replacement = replacement;
  };
  for (const key of new Set([...Object.keys(languageDictionary.fr), ...Object.keys(languageDictionary.en)])) {
    const french = languageDictionary.fr[key] ?? key;
    const english = languageDictionary.en[key] ?? key;
    const target = language === "fr" ? french : english;
    add(key, target);
    add(french, target);
    add(english, target);
  }
  return root;
}
const embeddedTries: Record<AppLanguage, TrieNode> = { fr: makeTrie("fr"), en: makeTrie("en") };

type TranslatedValue = { source: string; rendered: string };
const translatedTextNodes = new WeakMap<Text, TranslatedValue>();
const translatedAttributes = new WeakMap<Element, Map<string, TranslatedValue>>();

export function missingLanguageEntries(language: AppLanguage): string[] {
  return reviewedLanguageKeys.filter((key) => !(key in languageDictionary[language]));
}

export function translate(language: AppLanguage, frenchText: string): string {
  if (language === "fr") return frenchText;
  const exact = languageDictionary.en[frenchText];
  if (exact) return exact;
  const normalized = frenchText.replace(/\s+/g, " ").trim();
  const translated = languageDictionary.en[normalized];
  if (translated) return translated;
  // Fallback: try reverse lookup (English → French), then return French as-is
  if (language === "en") return englishToFrench.get(normalized) ?? frenchText;
  return frenchText;
}

/** Translate reviewed catalog entries embedded in a larger DOM text node. */
export function translateEmbedded(language: AppLanguage, text: string): string {
  const root = embeddedTries[language];
  let result = "";
  for (let start = 0; start < text.length;) {
    let node = root;
    let cursor = start;
    let lastEnd = -1;
    let replacement: string | undefined;
    while (cursor < text.length) {
      const child = node.next.get(text[cursor]);
      if (!child) break;
      node = child;
      cursor += 1;
      if (node.replacement) { lastEnd = cursor; replacement = node.replacement; }
    }
    if (lastEnd > start && replacement) {
      result += replacement;
      start = lastEnd;
    } else {
      result += text[start];
      start += 1;
    }
  }
  return result;
}

/** Traduction uniforme des nœuds et attributs, y compris les libellés générés
 * par les workbenchs et les contrôles d’accessibilité. */
export function translateDom(root: ParentNode, language: AppLanguage) {
  const attributes = ["aria-label", "title", "placeholder", "alt", "value"] as const;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) nodes.push(current as Text);
  for (const node of nodes) {
    const value = node.nodeValue ?? "";
    const previous = translatedTextNodes.get(node);
    const source = previous && value.trim() === previous.rendered ? previous.source : value.trim();
    if (!source) continue;
    const translated = translateEmbedded(language, source);
    translatedTextNodes.set(node, { source, rendered: translated });
    if (translated !== value.trim()) node.nodeValue = value.replace(value.trim(), translated);
  }
  root.querySelectorAll?.("*").forEach((element) => {
    for (const attribute of attributes) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      if (attribute === "value" && !(element instanceof HTMLInputElement && ["button", "submit", "reset"].includes(element.type))) continue;
      let values = translatedAttributes.get(element);
      if (!values) {
        values = new Map();
        translatedAttributes.set(element, values);
      }
      const previous = values.get(attribute);
      const source = previous && value === previous.rendered ? previous.source : value;
      const translated = translate(language, source);
      values.set(attribute, { source, rendered: translated });
      if (translated !== value) element.setAttribute(attribute, translated);
    }
  });
}

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === "fr" || value === "en";
}
