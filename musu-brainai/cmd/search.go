package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/blevesearch/bleve/v2"
	"github.com/spf13/cobra"
	"github.com/yellowhama/musu-brainai/internal/agent"
	"github.com/yellowhama/musu-brainai/internal/processor"
)

var searchCmd = &cobra.Command{
	Use:   "search [query]",
	Short: "Search the Wiki knowledge base locally",
	Args:  cobra.MinimumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		out, _ := cmd.Flags().GetString("out")
		semantic, _ := cmd.Flags().GetBool("semantic")
		model, _ := cmd.Flags().GetString("model")
		project, _ := cmd.Flags().GetString("project")
		queryStr := args[0]

		if semantic {
			runSemanticSearch(out, queryStr, model, project)
		} else {
			runBleveSearch(out, queryStr, project)
		}
	},
}

func runBleveSearch(out, queryStr, project string) {
	blevePath := filepath.Join(out, "musu.bleve")
	if _, err := os.Stat(blevePath); os.IsNotExist(err) {
		fmt.Println("❌ Search index not found. Please run 'musu-crawl index' first.")
		return
	}

	index, err := bleve.Open(blevePath)
	if err != nil {
		fmt.Printf("❌ Error opening index: %v\n", err)
		return
	}
	defer index.Close()

	// If project is specified and not "all", add project filter to query
	if project != "all" && project != "" {
		queryStr = fmt.Sprintf("+project:%s %s", project, queryStr)
	}

	query := bleve.NewQueryStringQuery(queryStr)
	searchRequest := bleve.NewSearchRequest(query)
	searchRequest.Fields = []string{"title", "source", "id", "summary", "project"}

	searchResults, err := index.Search(searchRequest)
	if err != nil {
		fmt.Printf("❌ Error searching: %v\n", err)
		return
	}

	if searchResults.Total == 0 {
		fmt.Printf("No results found for %q\n", queryStr)
		return
	}

	fmt.Printf("Found %d matches for %q (Bleve Keyword):\n\n", searchResults.Total, queryStr)
	for i, hit := range searchResults.Hits {
		title := hit.Fields["title"]
		source := hit.Fields["source"]
		hitProject := hit.Fields["project"]
		fmt.Printf("%d. [%s] %v (ID: %s, Project: %v)\n", i+1, source, title, hit.ID, hitProject)
		if summary, ok := hit.Fields["summary"]; ok && summary != "" {
			fmt.Printf("   Summary: %v\n", summary)
		}
		fmt.Println()
	}
}

func runSemanticSearch(out, queryStr, model, project string) {
	vectorFile := filepath.Join(out, "musu.vectors.json")
	indexFile := filepath.Join(out, "index.json")
	if _, err := os.Stat(vectorFile); os.IsNotExist(err) {
		fmt.Println("❌ Vector index not found. Please run 'musu-crawl index --semantic' first.")
		return
	}

	vstore := processor.NewVectorStore()
	if err := vstore.Load(vectorFile); err != nil {
		fmt.Printf("❌ Error loading vectors: %v\n", err)
		return
	}

	// Load metadata for display
	metaData := make(map[string]processor.IndexEntry)
	if data, err := os.ReadFile(indexFile); err == nil {
		var entries []processor.IndexEntry
		json.Unmarshal(data, &entries)
		for _, e := range entries {
			// Filter by project if requested
			if project != "all" && project != "" && e.Project != project {
				continue
			}
			metaData[e.ID] = e
		}
	}

	ollama := agent.NewOllamaClient(model)
	fmt.Printf("🧠 Generating query embedding for: %q...\n", queryStr)
	qVec, err := ollama.Embed(queryStr)
	if err != nil {
		fmt.Printf("❌ Embedding failed: %v\n", err)
		return
	}

	matches := vstore.Search(qVec, 10) // Get more to account for project filtering
	if len(matches) == 0 {
		fmt.Println("No semantic matches found.")
		return
	}

	fmt.Printf("Found matches for %q (Semantic Vector, Project: %s):\n\n", queryStr, project)
	count := 0
	for _, match := range matches {
		entry, ok := metaData[match.ID]
		if !ok {
			continue
		} // Skip if not in filtered metaData

		count++
		fmt.Printf("%d. [%s] %s (ID: %s, Project: %s, Score: %.4f)\n", count, entry.Source, entry.Title, match.ID, entry.Project, match.Score)
		if entry.Summary != "" {
			fmt.Printf("   Summary: %s\n", entry.Summary)
		}
		fmt.Println()
		if count >= 5 {
			break
		}
	}
	if count == 0 {
		fmt.Println("No matches found in the specified project.")
	}
}

func init() {
	searchCmd.Flags().String("out", "./wiki", "Wiki directory to search in")
	searchCmd.Flags().BoolP("semantic", "s", false, "Use vector semantic search")
	searchCmd.Flags().String("model", "nomic-embed-text", "Ollama model for query embedding")
	searchCmd.Flags().StringP("project", "p", "all", "Project to scope search (default 'all')")
	rootCmd.AddCommand(searchCmd)
}
