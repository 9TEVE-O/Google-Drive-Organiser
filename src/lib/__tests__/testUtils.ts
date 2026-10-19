import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

export { describe, it, beforeEach, afterEach };

export interface MockFn<TArgs extends any[] = any[], TReturn = any> {
  (...args: TArgs): TReturn;
  mock: {
    calls: TArgs[];
    results: Array<{ type: "return" | "throw"; value: any }>;
  };
  mockClear(): void;
  mockImplementation(fn: (...args: TArgs) => TReturn): MockFn<TArgs, TReturn>;
  mockImplementationOnce(fn: (...args: TArgs) => TReturn): MockFn<TArgs, TReturn>;
  mockResolvedValue(val: Awaited<TReturn>): MockFn<TArgs, Promise<Awaited<TReturn>>>;
  mockResolvedValueOnce(val: Awaited<TReturn>): MockFn<TArgs, Promise<Awaited<TReturn>>>;
  mockRejectedValue(err: unknown): MockFn<TArgs, Promise<never>>;
  mockRejectedValueOnce(err: unknown): MockFn<TArgs, Promise<never>>;
}

export const vi = {
  fn<TArgs extends any[] = any[], TReturn = any>(
    initialImpl?: (...args: TArgs) => TReturn
  ): MockFn<TArgs, TReturn> {
    let defaultImpl = initialImpl;
    const onceQueue: Array<(...args: TArgs) => TReturn> = [];
    const calls: TArgs[] = [];
    const results: Array<{ type: "return" | "throw"; value: any }> = [];

    const mockFn = ((...args: TArgs): TReturn => {
      calls.push(args);
      const activeImpl = onceQueue.length > 0 ? onceQueue.shift()! : defaultImpl;
      try {
        const value = activeImpl ? activeImpl(...args) : (undefined as unknown as TReturn);
        results.push({ type: "return", value });
        return value;
      } catch (err) {
        results.push({ type: "throw", value: err });
        throw err;
      }
    }) as MockFn<TArgs, TReturn>;

    mockFn.mock = { calls, results };
    mockFn.mockClear = () => {
      calls.length = 0;
      results.length = 0;
      onceQueue.length = 0;
    };
    mockFn.mockImplementation = (fn) => {
      defaultImpl = fn;
      return mockFn;
    };
    mockFn.mockImplementationOnce = (fn) => {
      onceQueue.push(fn);
      return mockFn;
    };
    mockFn.mockResolvedValue = (val) => {
      defaultImpl = (() => Promise.resolve(val)) as unknown as (...args: TArgs) => TReturn;
      return mockFn as unknown as MockFn<TArgs, Promise<Awaited<TReturn>>>;
    };
    mockFn.mockResolvedValueOnce = (val) => {
      onceQueue.push((() => Promise.resolve(val)) as unknown as (...args: TArgs) => TReturn);
      return mockFn as unknown as MockFn<TArgs, Promise<Awaited<TReturn>>>;
    };
    mockFn.mockRejectedValue = (err) => {
      defaultImpl = (() => Promise.reject(err)) as unknown as (...args: TArgs) => TReturn;
      return mockFn as unknown as MockFn<TArgs, Promise<never>>;
    };
    mockFn.mockRejectedValueOnce = (err) => {
      onceQueue.push((() => Promise.reject(err)) as unknown as (...args: TArgs) => TReturn);
      return mockFn as unknown as MockFn<TArgs, Promise<never>>;
    };

    return mockFn;
  },
  clearAllMocks() {
    // Handled per-instance via beforeEach
  },
};

export function expect<T>(actual: T) {
  const matchers = {
    toBe(expected: T) {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected: unknown) {
      assert.deepStrictEqual(actual, expected);
    },
    toBeDefined() {
      assert.notStrictEqual(actual, undefined);
    },
    toBeUndefined() {
      assert.strictEqual(actual, undefined);
    },
    toBeTruthy() {
      assert.ok(actual);
    },
    toBeFalsy() {
      assert.ok(!actual);
    },
    toContain(substring: string) {
      if (typeof actual === "string") {
        assert.ok(
          actual.includes(substring),
          `Expected "${actual}" to contain "${substring}"`
        );
      } else if (Array.isArray(actual)) {
        assert.ok(
          actual.includes(substring),
          `Expected array to contain "${substring}"`
        );
      } else {
        assert.fail(`Expected string or array in toContain, received ${typeof actual}`);
      }
    },
    toHaveLength(expectedLength: number) {
      assert.strictEqual((actual as any)?.length, expectedLength);
    },
    toHaveBeenCalled() {
      const fn = actual as unknown as MockFn;
      assert.ok(fn?.mock?.calls?.length > 0, "Expected mock function to have been called");
    },
    toHaveBeenCalledTimes(count: number) {
      const fn = actual as unknown as MockFn;
      assert.strictEqual(
        fn?.mock?.calls?.length,
        count,
        `Expected mock function to be called ${count} time(s), but was called ${fn?.mock?.calls?.length} time(s)`
      );
    },
    not: {
      toBe(expected: T) {
        assert.notStrictEqual(actual, expected);
      },
      toContain(substring: string) {
        if (typeof actual === "string") {
          assert.ok(
            !actual.includes(substring),
            `Expected "${actual}" not to contain "${substring}"`
          );
        }
      },
      toHaveBeenCalled() {
        const fn = actual as unknown as MockFn;
        assert.strictEqual(
          fn?.mock?.calls?.length,
          0,
          `Expected mock function not to be called, but it was called ${fn?.mock?.calls?.length} time(s)`
        );
      },
    },
    rejects: {
      async toThrow(expectedMessage?: string | RegExp) {
        let threw = false;
        let caughtErr: any = null;
        try {
          await (actual as unknown as Promise<unknown>);
        } catch (err) {
          threw = true;
          caughtErr = err;
        }
        assert.ok(threw, "Expected promise to reject, but it resolved");
        if (expectedMessage) {
          const message = String(caughtErr?.message || caughtErr);
          if (typeof expectedMessage === "string") {
            assert.ok(
              message.includes(expectedMessage),
              `Expected rejection message "${message}" to include "${expectedMessage}"`
            );
          } else {
            assert.match(message, expectedMessage);
          }
        }
      },
    },
  };

  return matchers;
}
