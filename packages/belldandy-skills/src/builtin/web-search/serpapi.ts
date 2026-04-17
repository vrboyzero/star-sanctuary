import type { SearchProvider, SearchResult, WebSearchOptions } from "./types.js";
import { createLinkedAbortController, isAbortError, readAbortReason, throwIfAborted } from "../../abort-utils.js";

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";

interface SerpApiResponse {
    organic_results?: Array<{
        title: string;
        link: string;
        snippet: string;
        date?: string;
        source?: string;
    }>;
    error?: string;
}

export class SerpApiProvider implements SearchProvider {
    name = "serpapi";

    async search(options: WebSearchOptions): Promise<SearchResult[]> {
        const apiKey = options.apiKey || process.env.SERPAPI_API_KEY;
        if (!apiKey) {
            throw new Error("Missing SERPAPI_API_KEY. Please set it in environment variables.");
        }

        const count = Math.min(Math.max(1, options.count || 5), 20);

        const url = new URL(SERPAPI_ENDPOINT);
        url.searchParams.set("engine", "google");
        url.searchParams.set("q", options.query);
        url.searchParams.set("api_key", apiKey);
        url.searchParams.set("num", String(count));
        if (options.country) {
            url.searchParams.set("gl", options.country); // Google uses 'gl' for country
        }

        throwIfAborted(options.abortSignal);
        const linkedAbort = createLinkedAbortController({
            signal: options.abortSignal,
            timeoutMs: 15000,
            timeoutReason: "SerpAPI timed out after 15000ms.",
        });

        try {
            const res = await fetch(url.toString(), {
                signal: linkedAbort.controller.signal,
            });

            if (!res.ok) {
                throw new Error(`SerpAPI error: ${res.status} ${res.statusText}`);
            }

            const data = (await res.json()) as SerpApiResponse;

            if (data.error) {
                throw new Error(`SerpAPI error: ${data.error}`);
            }

            const results = data.organic_results || [];

            return results.map((item) => ({
                title: item.title,
                url: item.link,
                snippet: item.snippet,
                published: item.date,
                source: item.source,
            }));
        } catch (error) {
            if (isAbortError(error)) {
                if (options.abortSignal?.aborted) {
                    throw new Error(readAbortReason(options.abortSignal));
                }
                throw new Error("SerpAPI timed out after 15000ms.");
            }
            throw error;
        } finally {
            linkedAbort.cleanup();
        }
    }
}
