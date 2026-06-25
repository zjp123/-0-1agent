declare module "mammoth" {
  export interface ExtractResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  export interface ExtractOptions {
    arrayBuffer?: ArrayBuffer;
    buffer?: Buffer;
    path?: string;
  }

  export function extractRawText(
    options: ExtractOptions,
  ): Promise<ExtractResult>;

  export function convertToHtml(
    options: ExtractOptions,
  ): Promise<ExtractResult>;

  export function convertToMarkdown(
    options: ExtractOptions,
  ): Promise<ExtractResult>;

  const _default: {
    extractRawText: typeof extractRawText;
    convertToHtml: typeof convertToHtml;
    convertToMarkdown: typeof convertToMarkdown;
  };
  export default _default;
}
