declare interface MagicBoltOptions {
  retries?: number;
  timeoutMs?: number;
}

declare function magicBolt(target: string, options?: MagicBoltOptions): Promise<number>;

declare const toolkit: {
  version: string;
  sum(a: number, b: number): number;
  nowISO(): string;
};
