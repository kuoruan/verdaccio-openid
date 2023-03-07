/**
 * Retry an action multiple times.
 *
 * @param action
 */
export function retry(action: () => void) {
  for (let i = 0; i < 10; i++) {
    setTimeout(() => action(), 100 * i);
  }
}

/**
 * Check if the path of a mouse event contains an element.
 *
 * @param selector the selector of the element to check for
 * @param e the mouse event
 * @returns
 */
function pathContainsElement(selector: string, e: MouseEvent): boolean {
  const path = e.path || e.composedPath?.();
  const element = document.querySelector(selector)!;

  return path.includes(element);
}

/**
 * Interrupt a click event on an element.
 *
 * @param selector the selector of the element to interrupt the click event for
 * @param callback new callback to run instead of the original click event
 */
export function interruptClick(selector: string, callback: () => void) {
  const handleClick = (e: MouseEvent) => {
    if (pathContainsElement(selector, e)) {
      e.preventDefault();
      e.stopPropagation();
      callback();
    }
  };
  const capture = true;
  document.addEventListener("click", handleClick, capture);
}
