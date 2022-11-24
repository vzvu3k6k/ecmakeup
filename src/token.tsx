type Token = {
  word: string;
  start: number;
  end: number;
};

export const findToken = (text: string, offset: number): Token | null => {
  const isDelimiter = (c: string) => " \u00a0.,()[]".indexOf(c) !== -1;

  if (isDelimiter(text[offset]) || text.length <= offset) {
    return null;
  }

  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (isDelimiter(c)) {
      if (offset < i) {
        return { word: text.slice(start, i), start, end: i };
      }
      start = i + 1;
    }
  }
  return { word: text.slice(start), start, end: text.length - 1 };
};

type Position = {
  x: number;
  y: number;
}

export const getTokenPosition = (node: Node, start: number, end: number): Position => {
  const range = new Range();
  range.setStart(node, start);
  range.setEnd(node, end);
  const rect = range.getBoundingClientRect();
  return { x: rect.left, y: rect.top };
};
