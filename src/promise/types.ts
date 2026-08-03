export type State<O> =
  | { status: "initial" }
  | { status: "pending" }
  | { status: "fulfilled"; value: O }
  | { status: "rejected"; reason: unknown };

export type DestructuredState<O> = State<O> & {
  initial: boolean;
  pending: boolean;
  fulfilled: boolean;
  rejected: boolean;
} & (
    | { status: "initial"; initial: true; pending: false; fulfilled: false; rejected: false }
    | { status: "pending"; initial: false; pending: true; fulfilled: false; rejected: false }
    | { status: "fulfilled"; initial: false; pending: false; fulfilled: true; rejected: false }
    | { status: "rejected"; initial: false; pending: false; fulfilled: false; rejected: true }
  );

export class RejectionError<T> extends Error {
  readonly reason: T;

  constructor(reason: T) {
    super(`promise rejected with ${reason}`);
    this.reason = reason;
  }
}
