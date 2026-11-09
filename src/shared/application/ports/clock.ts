export abstract class Clock {
  abstract now(): Date;
  abstract today(): string;
}
