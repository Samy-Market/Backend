export abstract class ResetTokens {
  abstract generate(): { token: string; hash: string };
  abstract hash(token: string): string;
}
