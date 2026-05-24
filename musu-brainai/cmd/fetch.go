package cmd

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/spf13/cobra"
	"github.com/yellowhama/musu-brainai/internal/agent"
	"github.com/yellowhama/musu-brainai/internal/harvester"
	"github.com/yellowhama/musu-brainai/internal/processor"
	"github.com/yellowhama/musu-brainai/internal/utils"
)

var fetchCmd = &cobra.Command{
	Use:   "fetch [source] [id]",
	Short: "Fetch content from a source (or multiple from a file)",
	Run: func(cmd *cobra.Command, args []string) {
		project, _ := cmd.Flags().GetString("project")
		conf, _ := utils.LoadConfig(project)

		filePath, _ := cmd.Flags().GetString("file")
		workers, _ := cmd.Flags().GetInt("workers")

		// If flag is default, use config value
		lang, _ := cmd.Flags().GetString("lang")
		if !cmd.Flags().Changed("lang") {
			lang = conf.Language
		}

		out, _ := cmd.Flags().GetString("out")
		if !cmd.Flags().Changed("out") {
			out = conf.WikiDir
		}

		compile, _ := cmd.Flags().GetBool("compile")

		model, _ := cmd.Flags().GetString("model")
		if !cmd.Flags().Changed("model") {
			model = conf.OllamaModel
		}

		proc := processor.NewWikiProcessor(out, project)

		if filePath != "" {
			runBatch(filePath, workers, lang, proc, compile, model)
		} else {
			if len(args) < 2 {
				fmt.Println("Please provide source and id, or use --file")
				return
			}
			RunSingle(args[0], args[1], lang, proc, compile, model)
		}
	},
}

func RunSingle(source, id, lang string, proc *processor.WikiProcessor, compile bool, model string) (string, error) {
	title, text, err := dispatchFetch(source, id, lang)
	if err != nil {
		return "", err
	}

	tags := utils.ExtractKeywords(text, 5)
	summary := utils.Summarize(text, 3)

	sourceDir := source
	if source == "yt" {
		sourceDir = "youtube"
	}
	if source == "gh" {
		sourceDir = "github"
	}
	if source == "arxiv" {
		sourceDir = "papers"
	}
	if source == "hf" {
		sourceDir = "huggingface"
	}
	if source == "x" {
		sourceDir = "twitter"
	}

	safeID := id
	if source == "gh" || source == "github" || source == "hf" || source == "huggingface" {
		safeID = strings.ReplaceAll(id, "/", "_")
	} else if source == "web" || source == "reddit" {
		safeID = strings.ReplaceAll(strings.ReplaceAll(id, "https://", ""), "/", "_")
		if len(safeID) > 100 {
			safeID = safeID[:100]
		}
	}

	fname, err := proc.SaveToWiki(sourceDir, safeID, title, text, tags, summary)
	if err != nil {
		return "", err
	}
	fmt.Printf("✅ Saved [%s] to Wiki project '%s': %s (Tags: %s)\n", id, proc.Project, fname, strings.Join(tags, ", "))

	// Autonmous Knowledge Compiling
	if compile {
		fmt.Printf("🧠 Compiling knowledge links for [%s]...\n", id)
		ollama := agent.NewOllamaClient(model)
		compiler, err := agent.NewCompiler(ollama, proc.BaseDir)
		if err == nil {
			defer compiler.Close()
			fullPath := filepath.Join(proc.BaseDir, "projects", proc.Project, sourceDir, fname)
			section, err := compiler.CompileDocument(fullPath, text, tags, summary)
			if err == nil && section != "" {
				compiler.UpdateDocument(fullPath, section)
				fmt.Printf("   🔗 Knowledge graph updated for %s\n", id)
			}
		} else {
			fmt.Printf("   ⚠️  Compiler skipped: %v\n", err)
		}
	}

	return text, nil
}

func dispatchFetch(source, id, lang string) (string, string, error) {
	source = strings.ToLower(source)
	switch source {
	case "yt", "youtube":
		f := &harvester.YouTubeFetcher{Language: lang}
		return f.Fetch(id)
	case "gh", "github":
		f := &harvester.GitHubFetcher{}
		return f.Fetch(id)
	case "web":
		f := &harvester.WebFetcher{}
		return f.Fetch(id)
	case "arxiv":
		f := &harvester.ArxivFetcher{}
		return f.Fetch(id)
	case "hf", "huggingface":
		f := &harvester.HuggingFaceFetcher{}
		return f.Fetch(id)
	case "x", "twitter":
		f := &harvester.TwitterFetcher{}
		return f.Fetch(id)
	case "reddit":
		f := &harvester.RedditFetcher{}
		return f.Fetch(id)
	default:
		return "", "", fmt.Errorf("unsupported source: %s", source)
	}
}

type job struct {
	source string
	id     string
}

func runBatch(filePath string, numWorkers int, lang string, proc *processor.WikiProcessor, compile bool, model string) {
	file, err := os.Open(filePath)
	if err != nil {
		fmt.Printf("Error opening file: %v\n", err)
		return
	}
	defer file.Close()

	jobs := make(chan job)
	var wg sync.WaitGroup

	for i := 1; i <= numWorkers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for j := range jobs {
				RunSingle(j.source, j.id, lang, proc, compile, model)
			}
		}(i)
	}

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.Fields(line)
		if len(parts) >= 2 {
			jobs <- job{source: parts[0], id: parts[1]}
		} else {
			id := parts[0]
			source := autoDetectSource(id)
			if source != "" {
				jobs <- job{source: source, id: id}
			} else {
				fmt.Printf("⚠️  Skipping line: %s (could not detect source)\n", line)
			}
		}
	}
	close(jobs)
	wg.Wait()
	fmt.Println("\nBatch processing completed.")
}

func autoDetectSource(input string) string {
	if strings.Contains(input, "youtube.com") || strings.Contains(input, "youtu.be") {
		return "yt"
	}
	if strings.Contains(input, "github.com") {
		return "gh"
	}
	if strings.Contains(input, "arxiv.org") {
		return "arxiv"
	}
	if strings.Contains(input, "huggingface.co") {
		return "hf"
	}
	if strings.Contains(input, "twitter.com") || strings.Contains(input, "x.com") {
		return "x"
	}
	if strings.Contains(input, "reddit.com") {
		return "reddit"
	}
	if strings.HasPrefix(input, "http") {
		return "web"
	}
	return ""
}

func init() {
	fetchCmd.Flags().StringP("file", "f", "", "Input file with source and id/url per line")
	fetchCmd.Flags().IntP("workers", "w", 5, "Number of concurrent workers")
	fetchCmd.Flags().String("lang", "ko", "Preferred language")
	fetchCmd.Flags().String("out", "./wiki", "Output directory")
	fetchCmd.Flags().Bool("compile", false, "Automatically compile knowledge links after fetch")
	fetchCmd.Flags().String("model", "llama3", "Ollama model for compilation reasoning")
	fetchCmd.Flags().StringP("project", "p", "default", "Project name to scope the knowledge")
	rootCmd.AddCommand(fetchCmd)
}
