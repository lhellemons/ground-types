import { constant, compose, curry, identity } from "./functions";

describe(identity, () => {
  it("returns its input exactly", () => {
    const obj = { prop: "value" };
    const arr = ["one", "two", "three"];

    expect(identity(null)).toBe(null);
    expect(identity(undefined)).toBe(undefined);
    expect(identity("string")).toBe("string");
    expect(identity(42)).toBe(42);
    expect(identity(true)).toBe(true);
    expect(identity(obj)).toBe(obj); // exact same reference
    expect(identity(arr)).toBe(arr); // exact same reference
  });
});

describe(constant, () => {
  it("returns a function that always returns the given value", () => {
    const obj = { prop: "value" };
    const arr = ["one", "two", "three"];

    expect(constant(null)()).toBe(null);
    expect(constant(undefined)()).toBe(undefined);
    expect(constant("string")()).toBe("string");
    expect(constant(42)()).toBe(42);
    expect(constant(true)()).toBe(true);
    expect(constant(obj)()).toBe(obj); // exact same reference
    expect(constant(arr)()).toBe(arr); // exact same reference
  });
});

describe(compose, () => {
  const parse = (s: string): number => parseInt(s, 10) || 0;
  const double = (n: number): number => n * 2;

  it("returns a combined Mapper", () => {
    expect(compose(parse, double, "21")).toEqual(42);
  });
  it("works in curried form", () => {
    const parseAndDouble = compose(parse, double);
    expect(parseAndDouble("21")).toEqual(42);
  });
});

describe(curry, () => {
  it("applies the Mapper if the second parameter is present", () => {
    expect(curry(JSON.stringify, { foo: "bar" })).toEqual('{"foo":"bar"}');
  });
  it("returns the Mapper if the second parameter is absent", () => {
    expect(curry(JSON.stringify)).toBeFunction();
    expect((curry(JSON.stringify) as Function)({ foo: "bar" })).toEqual('{"foo":"bar"}');
  });
});
