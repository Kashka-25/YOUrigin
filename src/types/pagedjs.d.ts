declare module 'pagedjs' {
  export class Previewer {
    on(event: 'page', cb: (page: unknown) => void): void;
    preview(content: string | Node, stylesheets: (string | Record<string, string>)[], renderTo: HTMLElement): Promise<{ total?: number; pages?: unknown[] }>;
  }
  export class Handler {
    constructor(chunker: unknown, polisher: unknown, caller: unknown);
  }
  export function registerHandlers(...handlers: (typeof Handler)[]): void;
}
