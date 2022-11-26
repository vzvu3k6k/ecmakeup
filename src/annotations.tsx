import React, { JSX } from "jsx-dom";

export const lookup = (word: string): JSX.Element | null => {
  return table[word] || null;
}

const table: { [key: string]: JSX.Element } = {
  "!": <p><code>!</code> (ReturnIfAbrupt Shorthand): このabstract operationはabrupt completionを返さない!</p>,
  "?": <p><code>?</code> (ReturnIfAbrupt Shorthand): abrupt completionが返されたらそれをreturnする</p>,
  ":": (
    <p>
      <a href="#sec-syntactic-grammar">Syntactic Grammar</a>
    </p>
  ),
  "::": (
    <p>
      <a href="#sec-lexical-and-regexp-grammars">
        Lexical and RegExp Grammar
      </a>
    </p>
  ),
  ":::": (
    <p>
      <a href="#sec-numeric-string-grammar">
        Numeric String Grammar
      </a>
    </p>
  ),
  "opt": (
    <p>
      <a href="#sec-optional-symbols">Optional Symbol</a>: このトークンは省略可能
    </p>
  ),
};
