package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
	"github.com/yellowhama/musu-brainai/internal/agent"
	"github.com/yellowhama/musu-brainai/internal/processor"
)

var compileCmd = &cobra.Command{
	Use:   "compile [file_path]",
	Short: "Compile relationships and cross-links for the Wiki",
	Run: func(cmd *cobra.Command, args []string) {
		out, _ := cmd.Flags().GetString("out")
		model, _ := cmd.Flags().GetString("model")
		force, _ := cmd.Flags().GetBool("force")
		project, _ := cmd.Flags().GetString("project")

		ollama := agent.NewOllamaClient(model)
		compiler, err := agent.NewCompiler(ollama, out)
		if err != nil {
			fmt.Printf("❌ Error: %v\n", err)
			return
		}
		defer compiler.Close()

		proc := processor.NewWikiProcessor(out, project)

		if len(args) > 0 {
			// Compile specific file
			path := args[0]
			runCompileForFile(compiler, proc, path, force)
		} else {
			// Scan specific project or entire wiki
			targetDir := out
			if project != "" && project != "all" {
				targetDir = filepath.Join(out, "projects", project)
			}

			fmt.Printf("📂 Compiling wiki at %s...\n", targetDir)
			err := filepath.Walk(targetDir, func(path string, info os.FileInfo, err error) error {
				if err != nil || info.IsDir() || filepath.Ext(path) != ".md" || filepath.Base(path) == "README.md" {
					return nil
				}
				runCompileForFile(compiler, proc, path, force)
				return nil
			})
			if err != nil {
				fmt.Printf("❌ Walk failed: %v\n", err)
			}
		}

		fmt.Println("\n✅ Compilation completed.")
	},
}

func runCompileForFile(c *agent.Compiler, p *processor.WikiProcessor, path string, force bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Printf("   ⚠️  Failed to read %s: %v\n", path, err)
		return
	}

	content := string(data)
	if !force && strings.Contains(content, "## 🧠 Related Knowledge") {
		return // Skip already compiled
	}

	fmt.Printf("🧠 Compiling relations for: %s...\n", filepath.Base(path))

	relPath, _ := filepath.Rel(p.BaseDir, path)
	entry, docContent, err := p.ParseFrontmatterWithContent(path, relPath)
	if err != nil {
		fmt.Printf("   ⚠️  Failed to parse %s: %v\n", path, err)
		return
	}

	section, err := c.CompileDocument(path, docContent, entry.Tags, entry.Summary)
	if err != nil {
		fmt.Printf("   ❌ Compilation failed for %s: %v\n", path, err)
		return
	}

	if section != "" {
		if err := c.UpdateDocument(path, section); err != nil {
			fmt.Printf("   ❌ Failed to update %s: %v\n", path, err)
		} else {
			fmt.Printf("   ✅ Added links to %d related documents.\n", strings.Count(section, "\n*"))
		}
	} else {
		fmt.Println("   ℹ️  No strong relationships found.")
	}
}

func init() {
	compileCmd.Flags().String("out", "./wiki", "Wiki directory to compile")
	compileCmd.Flags().String("model", "llama3", "Ollama model for reasoning")
	compileCmd.Flags().Bool("force", false, "Force re-compilation even if links exist")
	compileCmd.Flags().StringP("project", "p", "default", "Specific project to compile (use 'all' for everything)")
	rootCmd.AddCommand(compileCmd)
}
