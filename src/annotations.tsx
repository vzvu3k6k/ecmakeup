import React, { JSX } from "jsx-dom";

export const lookup = (node: Node, word: string): JSX.Element | null => {
  const m = rules.find(r => r.matcher(node, word));
  if (m) {
    return m.content;
  }
  return null;
}

type Matcher = (node: Node, word: string) => boolean;

const matcher = (tagName: string, word?: string): Matcher => {
  return (node: Node, _word: string) => {
    if (!isDescendantOf(node, tagName)) return false;
    if (word === undefined) return true;
    return _word === word;
  };
};

const isDescendantOf = (node: Node, tagName: string): boolean => {
  for (let c: Node | null = node; c; c = c.parentElement) {
    if ("tagName" in c && (c as Element).tagName.toLowerCase() === tagName) {
      return true;
    }
  }
  return false;
};

type Rule = {
  matcher: Matcher;
  content: JSX.Element;
};

const rules: Rule[] = [
  {
    matcher: matcher("emu-alg", "!"),
    content: (
      <p>
        <code>!</code> (ReturnIfAbrupt Shorthand): このabstract operationはabrupt completionを返さない!
      </p>
    ),
  },
  {
    matcher: matcher("emu-alg", "?"),
    content: (
      <p>
        <code>?</code> (ReturnIfAbrupt Shorthand): abrupt completionが返されたらそれをreturnする
      </p>
    ),
  },
  {
    matcher: matcher("emu-geq", ":"),
    content: (
      <p>
        <a href="#sec-syntactic-grammar">Syntactic Grammar</a>
      </p>
    ),
  },
  {
    matcher: matcher("emu-geq", "::"),
    content: (
      <p>
        <a href="#sec-lexical-and-regexp-grammars">
          Lexical and RegExp Grammar
        </a>
      </p>
    ),
  },
  {
    matcher: matcher("emu-geq", ":::"),
    content: (
      <p>
        <a href="#sec-numeric-string-grammar">
          Numeric String Grammar
        </a>
      </p>
    ),
  },
  {
    matcher: matcher("emu-opt", "opt"),
    content: (
      <p>
        <a href="#sec-optional-symbols">Optional Symbol</a>: このトークンは省略可能
      </p>
    ),
  },
  {
    matcher: matcher("emu-const"),
    content: (
      <p>
        sans-serif typeface: <a href="#sec-enum-specification-type">Enum Specification Type</a>
      </p>
    )
  },
];
