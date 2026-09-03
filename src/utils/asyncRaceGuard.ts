/**
 * Asynchronous Race Condition & Stale Response Guards
 * Ensures out-of-order network responses, modified intent versions, or session resets
 * never overwrite fresher UI state or execute against stale parameters.
 */

export class SequenceRaceGuard {
  private latestSequenceId = 0;

  /**
   * Generates a new monotonically increasing request sequence number.
   */
  public nextSequence(): number {
    this.latestSequenceId += 1;
    return this.latestSequenceId;
  }

  /**
   * Checks if a response from sequenceId is still the freshest and not superseded.
   */
  public isFresh(sequenceId: number): boolean {
    return sequenceId === this.latestSequenceId;
  }

  public reset(): void {
    this.latestSequenceId += 1;
  }
}

export class IntentVersionGuard {
  /**
   * Verifies that the intent version attached to an incoming async response matches current active version.
   */
  public static isResponseFresh(responseIntentVersion: number, currentActiveIntentVersion: number): boolean {
    return responseIntentVersion === currentActiveIntentVersion;
  }
}

export class ProposalDigestGuard {
  /**
   * Verifies that the proposal digest of an incoming simulation/review matches the active proposal digest.
   */
  public static isProposalFresh(responseDigest: string, activeProposalDigest: string): boolean {
    return responseDigest === activeProposalDigest;
  }
}
