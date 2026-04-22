declare module "pdf-parse/lib/pdf-parse.js" {
  const mod: unknown;
  export default mod;
}

declare module "pdf-parse" {
  const mod: unknown;
  export default mod;
}

declare module "word-extractor" {
  class WordExtractor {
    extract(source: string | Buffer): Promise<{ getBody: () => string }>;
  }
  export default WordExtractor;
}
