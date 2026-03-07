export type MethodMetadata = {
    summary?: string;
    status?: string;
    version?: string;
    createdAt?: string;
    updatedAt?: string;
    lastVerified?: string;
    readWhen: string[];
    tags: string[];
};

export type ParsedMethod = {
    raw: string;
    body: string;
    frontmatter?: string;
    metadata: MethodMetadata;
    title?: string;
    sections: string[];
};

function stripQuotes(value: string): string {
    return value.trim().replace(/^['"]|['"]$/g, "");
}

function normalizeKey(key: string): string {
    return key.trim().toLowerCase().replace(/_/g, "");
}

export function parseMethodContent(content: string): ParsedMethod {
    let body = content;
    let frontmatter: string | undefined;

    const metadata: MethodMetadata = {
        readWhen: [],
        tags: [],
    };

    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (frontmatterMatch) {
        frontmatter = frontmatterMatch[1];
        body = content.slice(frontmatterMatch[0].length);

        let activeListKey: "readWhen" | "tags" | null = null;
        for (const rawLine of frontmatter.split(/\r?\n/)) {
            const trimmed = rawLine.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;

            if (trimmed.startsWith("- ") && activeListKey) {
                metadata[activeListKey].push(stripQuotes(trimmed.slice(2)));
                continue;
            }

            const separatorIndex = trimmed.indexOf(":");
            if (separatorIndex <= 0) {
                activeListKey = null;
                continue;
            }

            const rawKey = trimmed.slice(0, separatorIndex).trim();
            const key = normalizeKey(rawKey);
            const rawValue = trimmed.slice(separatorIndex + 1).trim();
            const value = stripQuotes(rawValue);

            activeListKey = null;

            switch (key) {
                case "summary":
                    metadata.summary = value;
                    break;
                case "status":
                    metadata.status = value;
                    break;
                case "version":
                    metadata.version = value;
                    break;
                case "createdat":
                    metadata.createdAt = value;
                    break;
                case "updatedat":
                    metadata.updatedAt = value;
                    break;
                case "lastverified":
                    metadata.lastVerified = value;
                    break;
                case "readwhen":
                    if (value) {
                        metadata.readWhen.push(value);
                    } else {
                        activeListKey = "readWhen";
                    }
                    break;
                case "tags":
                    if (value) {
                        metadata.tags.push(...value.split(",").map((tag) => stripQuotes(tag)).filter(Boolean));
                    } else {
                        activeListKey = "tags";
                    }
                    break;
                default:
                    break;
            }
        }
    }

    const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const sections = Array.from(body.matchAll(/^##+\s+(.+)$/gm)).map((match) => match[1].trim());

    return { raw: content, body, frontmatter, metadata, title, sections };
}

