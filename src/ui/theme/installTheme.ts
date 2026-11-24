import { tokenMap, tokensToCssVars } from './themeCss';

const STYLE_ID = 'haunted-theme';

/** Injects the token variables once into one `<style>` element. */
export function installTheme(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = tokensToCssVars(tokenMap());
  doc.head.appendChild(style);
}
