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
      // TODO: support chrome
      const { offsetNode, offset } = (document as any).caretPositionFromPoint(e.clientX, e.clientY);

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