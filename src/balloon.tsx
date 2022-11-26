import React from "jsx-dom";

export class Balloon {
  readonly mountTarget: HTMLElement;

  constructor(mountTarget: HTMLElement) {
    this.mountTarget = mountTarget;
  }

  hide() {
    this.mountTarget.replaceChildren();
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

const BalloonComponent = ({ x, y, content }: BalloonComponentProps): HTMLElement => {
  return renderJSX(
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

const renderJSX = (element: JSX.Element): HTMLElement => {
  return element as unknown as HTMLElement;
};
