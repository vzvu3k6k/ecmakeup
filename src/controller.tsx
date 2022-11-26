import { Balloon } from './balloon';
import { findToken, getTokenPosition } from './token';
import { lookup } from "./annotations";

import './index.css'

export class Controller {
  balloon: Balloon;

  constructor({ balloon }: { balloon: Balloon }) {
    this.balloon = balloon;
  }

  register(document: Document) {
    document.addEventListener('mousemove', (e) => {
      const { offsetNode, offset } = caretPositionFromPoint(document, e.clientX, e.clientY);

      const token = findToken(offsetNode.nodeValue, offset);
      if (!token) {
        this.balloon.hide();
        return;
      }

      const content = lookup(token.word);
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

// TODO: remove implicit any types
const caretPositionFromPoint = (document, ...args) => {
  // Firefox
  if (document.caretPositionFromPoint) {
    const { offsetNode, offset } = document.caretPositionFromPoint(...args);
    return { offsetNode, offset };
  }

  // Chrome
  if (document.caretRangeFromPoint) {
    const { startContainer, startOffset } = document.caretRangeFromPoint(...args);
    return { offsetNode: startContainer, offset: startOffset };
  }

  throw new Error('Neither caretPositionFromPoint nor caretRangeFromPoint is supported.');
}