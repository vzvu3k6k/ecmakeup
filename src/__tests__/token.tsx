import { findToken } from '../token';

describe('findToken', () => {
  test.each([
    { input: "this app|le", expected: { word: "apple", start: 5, end: 9 } },
    { input: "|?\u00a0OperationName().", expected: { word: "?", start: 0, end: 1 } },
  ])("$input", ({ input, expected }) => {
    const text = input.replace(/\|/, "");
    const offset = input.indexOf("|");
    expect(findToken(text, offset)).toStrictEqual(expected);
  });
});
