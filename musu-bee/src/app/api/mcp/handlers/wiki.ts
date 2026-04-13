import { queryWiki } from "@/lib/wiki";

export function handleSearchWiki(params: Record<string, unknown>): unknown {
  if (typeof params.query !== "string") return { error: "query_required", results: [] };
  try {
    const results = queryWiki(
      params.query,
      typeof params.scope === "string" ? params.scope : "global",
      typeof params.limit === "number" ? params.limit : 5,
    );
    return { results, count: results.length };
  } catch {
    return { error: "wiki_unavailable", results: [] };
  }
}
