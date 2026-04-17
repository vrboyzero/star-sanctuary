export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    published?: string;
    source?: string;
}

export interface WebSearchOptions {
    query: string;
    count?: number; // Default 5
    country?: string; // e.g. 'us', 'cn'
    abortSignal?: AbortSignal;

    // Provider specific settings
    apiKey?: string;
}

export interface SearchProvider {
    name: string;
    search(options: WebSearchOptions): Promise<SearchResult[]>;
}
