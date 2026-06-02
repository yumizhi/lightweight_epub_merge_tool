export class EpubMergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EpubMergeError";
  }
}

export class InvalidEpubError extends EpubMergeError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEpubError";
  }
}

export class OrderingError extends EpubMergeError {
  constructor(message: string) {
    super(message);
    this.name = "OrderingError";
  }
}

export class ManifestError extends EpubMergeError {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}
