import { Balloon } from './balloon';
import { findToken, getTokenPosition } from './token';
import { lookup } from "./annotations";

export class Controller {
  balloon: Balloon;

  constructor({ balloon }: { balloon: Balloon }) {
    this.balloon = balloon;
  }

  register(document: Document) {
    document.addEventListener('mousemove', (e) => {
      if (this.balloon.isHover()) {
        return;
      }

      const { offsetNode, offset } = caretPositionFromPoint(document, e.clientX, e.clientY);      
      const token = findToken(offsetNode.nodeValue, offset);
      if (!token) {
        this.balloon.hide();
        return;
      }

      const content = lookup(offsetNode, token.word);
      if (!content) {
        this.balloon.hide();
        return;
      }

      const pos = getTokenPosition(offsetNode, token.start, token.end);
      this.balloon.render({
        x: window.scrollX + pos.x,
        y: window.scrollY + pos.y,
        content,
      });
    });
  }
}

const caretPositionFromPoint = (document: any, x: number, y: number) => {
  // Firefox
  if (document.caretPositionFromPoint) {
    const { offsetNode, offset } = document.caretPositionFromPoint(x, y);
    return { offsetNode, offset };
  }

  // Chrome
  if (document.caretRangeFromPoint) {
    const { startContainer, startOffset } = document.caretRangeFromPoint(x, y);
    return { offsetNode: startContainer, offset: startOffset };
  }

  throw new Error('Neither caretPositionFromPoint nor caretRangeFromPoint is supported.');
}