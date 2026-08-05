/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
/**
 * PROTOTYPE — throwaway, for `prototypes/root-export-bundle-cost` only.
 *
 * Member inventory per issue #45: `abortable` and `resultify` are instance
 * methods, not statics. Types are erased before a bundler sees this file.
 */
import { abortable, resultify } from './index.js'

class CallBox<R> {
  private constructor(private readonly held: R) {}

  private static of<S>(held: S): CallBox<S> {
    return new CallBox(held)
  }

  static from(call: any): CallBox<any> {
    return CallBox.of(call)
  }

  abortable(): CallBox<any> {
    return CallBox.of(abortable(this.held as any))
  }

  resultify(): CallBox<any> {
    return CallBox.of((resultify as any)(this.held))
  }

  invoke(input?: any): any {
    return (this.held as (input: any) => any)(input)
  }

  unbox(): R {
    return this.held
  }

  get call(): R {
    return this.held
  }
}

export const Call = CallBox
