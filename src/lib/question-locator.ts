/** Scroll an originating question into view and briefly distinguish it from its neighbours. */
export async function revealLocatedQuestion(find: () => HTMLElement | null): Promise<HTMLElement | null> {
  let element: HTMLElement | null = null;
  // A route change and a paged/tabbed list can each take a paint before the row exists.
  for (let attempt = 0; attempt < 12 && !element; attempt++) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    element = find();
  }
  if (!element) return null;
  element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  element.classList.remove('question-origin-flash');
  void element.offsetWidth;
  element.classList.add('question-origin-flash');
  window.setTimeout(() => element?.classList.remove('question-origin-flash'), 1_600);
  return element;
}
