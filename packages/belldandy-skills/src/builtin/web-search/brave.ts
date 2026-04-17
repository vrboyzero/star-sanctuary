import type { SearchProvider, SearchResult, WebSearchOptions } from "./types.js";
import { createLinkedAbortController, isAbortError, readAbortReason, throwIfAborted } from "../../abort-utils.js";

const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

interface BraveSearchResponse {
    web?: {
        results?: Array<{
            title: string;
            url: string;
            description: string;
            age?: string;
            profile?: { name: string };
        }>;
    };
}

export class BraveSearchProvider implements SearchProvider {
    name = "brave";

    async search(options: WebSearchOptions): Promise<SearchResult[]> {
        const apiKey = options.apiKey || process.env.BRAVE_API_KEY;
        if (!apiKey) {
            throw new Error("Missing BRAVE_API_KEY. Please set it in environment variables.");
        }

        const count = Math.min(Math.max(1, options.count || 5), 20);

        const url = new URL(BRAVE_SEARCH_ENDPOINT);
        url.searchParams.set("q", options.query);
        url.searchParams.set("count", String(count));
        if (options.country) {
            url.searchParams.set("country", options.country);
        }

        throwIfAborted(options.abortSignal);
        const linkedAbort = createLinkedAbortController({
            signal: options.abortSignal,
            timeoutMs: 10000,
            timeoutReason: "Brave Search timed out after 10000ms.",
        });

        try {
            const res = await fetch(url.toString(), {
                headers: {
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip",
                    "X-Subscription-Token": apiKey,
                },
                signal: linkedAbort.controller.signal,
            });

            if (!res.ok) {
                throw new Error(`Brave Search API error: ${res.status} ${res.statusText}`);
            }

            const data = (await res.json()) as BraveSearchResponse;
            const results = data.web?.results || [];

            return results.map((item) => ({
                title: item.title,
                url: item.url,
                snippet: item.description,
                published: item.age,
                source: item.profile?.name,
            }));
        } catch (error) {
            if (isAbortError(error)) {
                if (options.abortSignal?.aborted) {
                    throw new Error(readAbortReason(options.abortSignal));
                }
                throw new Error("Brave Search timed out after 10000ms.");
            }
            throw error;
        } finally {
            linkedAbort.cleanup();
        }
    }
}
