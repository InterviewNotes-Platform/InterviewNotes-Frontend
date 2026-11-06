/**
 * Makes the page inert and returns the undo, which clears only what this call set. Radix's own `aria-hidden` spares
 * every live region and its ancestors (Copy's status), so those would stay reachable behind the modal.
 */
export function inertPage() {
   const page = Array.from(document.body.children).filter((element) => element.tagName !== "SCRIPT" && !element.hasAttribute("inert"));
   page.forEach((element) => element.setAttribute("inert", ""));
   return () => page.forEach((element) => element.removeAttribute("inert"));
}
