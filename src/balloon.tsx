import React, { JSX } from "jsx-dom";
import debounce from 'lodash.debounce';

import './index.css'

export class Balloon {
  readonly mountTarget: HTMLElement;
  readonly hide: () => void;

  constructor(mountTarget: HTMLElement) {
    this.mountTarget = mountTarget;
    this.hide = debounce(() => {
      if (!this.isHover()) {
        this.mountTarget.replaceChildren();
      }
    }, 1000);
  }

  isHover() {
    return this.mountTarget.matches(':hover');
  }

  render({ x, y, content }: BalloonComponentProps) {
    let node = BalloonComponent({ x: 0, y: 0, content });
    this.mountTarget.replaceChildren(node);

    const rect = node.getBoundingClientRect();
    node = BalloonComponent({ x, y: y - rect.height, content });
    this.mountTarget.replaceChildren(node);
  }
}

type BalloonComponentProps = {
  x: number;
  y: number;
  content: any;
};

const BalloonComponent = ({ x, y, content }: BalloonComponentProps): JSX.Element => {
  return (
    <div
      className="toolbox-container active"
      style={{ left: `calc(${x}px - 1em)`, top: `${y}px` }}
    >
      <div className="toolbox">
        <div className="ecmakeup-description">
          {content}
        </div>
      </div>
    </div>
  );
};
