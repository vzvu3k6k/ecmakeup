import React, { JSX } from "jsx-dom";

export const lookup = (word: string): HTMLElement | null => {
  return table[word] || null;
}

const r = (element: JSX.Element): HTMLElement => {
  return element as unknown as HTMLElement;
};

const table: { [key: string]: HTMLElement } = {
  "!": r(<p><code>!</code> (ReturnIfAbrupt Shorthand): このabstract operationはabrupt completionを返さない!</p>),
  "?": r(<p><code>?</code> (ReturnIfAbrupt Shorthand): abrupt completionが返されたらそれをreturnする</p>),
  ":": r(
    <p>
      <a href="#sec-syntactic-grammar">Syntactic Grammar</a>
    </p>
  ),
  "::": r(
    <p>
      <a href="#sec-lexical-and-regexp-grammars">
        Lexical and RegExp Grammar
      </a>
    </p>
  ),
  ":::": r(
    <p>
      <a href="#sec-numeric-string-grammar">
        Numeric String Grammar
      </a>
    </p>
  ),
  "opt": r(
    <p>
      <a href="#sec-optional-symbols">Optional Symbol</a>: このトークンは省略可能
    </p>
  ),
};
