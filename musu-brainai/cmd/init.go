package cmd

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/spf13/cobra"
)

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Initialize the Wiki directory and check environment",
	Run: func(cmd *cobra.Command, args []string) {
		out, _ := cmd.Flags().GetString("out")

		fmt.Printf("🚀 Initializing musu-crawl-ai (Version %s)...\n", Version)

		// 1. Create directory structure
		dirs := []string{
			out,
			filepath.Join(out, "projects"),
			filepath.Join(out, "projects", "default"),
			filepath.Join(out, "projects", "default", "youtube"),
			filepath.Join(out, "projects", "default", "github"),
			filepath.Join(out, "projects", "default", "papers"),
			filepath.Join(out, "projects", "default", "web"),
			filepath.Join(out, "projects", "default", "twitter"),
			filepath.Join(out, "projects", "default", "huggingface"),
			filepath.Join(out, "projects", "default", "reddit"),
		}

		for _, d := range dirs {
			if err := os.MkdirAll(d, 0755); err != nil {
				fmt.Printf("❌ Failed to create directory %s: %v\n", d, err)
			} else {
				fmt.Printf("✅ Directory ready: %s\n", d)
			}
		}

		// 2. Check for Ollama
		fmt.Print("🧠 Checking for local Ollama service... ")
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Get("http://localhost:11434/api/tags")
		if err != nil || resp.StatusCode != 200 {
			fmt.Println("⚠️  Ollama not detected or not running. Local AI features (research, compile, semantic search) will be limited.")
			fmt.Println("   Tip: Install Ollama at https://ollama.com to enable full intelligence.")
		} else {
			fmt.Println("✅ Ollama detected and active.")
			resp.Body.Close()
		}

		// 3. Check for Search Index
		blevePath := filepath.Join(out, "musu.bleve")
		if _, err := os.Stat(blevePath); os.IsNotExist(err) {
			fmt.Println("ℹ️  Search index not found. You may want to run 'musu-crawl index' once you have fetched content.")
		} else {
			fmt.Println("✅ Search index found.")
		}

		fmt.Println("\n✨ Initialization complete! You are ready to crawl.")
	},
}

func init() {
	initCmd.Flags().String("out", "./wiki", "Wiki directory to initialize")
	rootCmd.AddCommand(initCmd)
}
