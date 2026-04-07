export interface ReconnectDecision {
  shouldRetry: boolean;
  nextDelayMs: number | null;
  attempt: number;
}

export class ReconnectPolicy {
  private attempt = 0;

  constructor(
    private readonly maxReconnects = 3,
    private readonly delays = [1000, 3000, 8000],
  ) {}

  reset(): void {
    this.attempt = 0;
  }

  next(): ReconnectDecision {
    if (this.attempt >= this.maxReconnects) {
      return {
        shouldRetry: false,
        nextDelayMs: null,
        attempt: this.attempt,
      };
    }

    const delay = this.delays[this.attempt] ?? this.delays[this.delays.length - 1] ?? 8000;
    this.attempt += 1;

    return {
      shouldRetry: true,
      nextDelayMs: delay,
      attempt: this.attempt,
    };
  }
}
