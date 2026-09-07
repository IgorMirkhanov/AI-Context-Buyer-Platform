export class ConnectionVerificationFailedError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly reason: string,
  ) {
    super(reason);
    this.name = 'ConnectionVerificationFailedError';
  }
}
